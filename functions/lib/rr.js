// Russian Roulette live table, run by the server. A port of the host side of rlGame/rlDraw/rlTick/rlTurn/
// rlGate/rlCollectRet in public/index.html.
//
// The app plays a live game "in lockstep": every seat replays the same event list (T.ev) with its own 3D
// animation, pausing at the same points (rlNeed). The phone host used to produce those events while it
// animated; the server produces the identical sequence, as fast as the rules allow, and only stops to wait
// for a real player's move (a "gate": draw / pick / fire) or for return fire. Because seats replay behind the
// server, a gate's 40s clock starts from an estimate of when that seat's replay reaches it (sv.clk).
//
// T = rrtable/live. T.sv = server state: phase, deadline, who's alive, the bullet count streak, whose turn,
// away (went quiet: bot plays the seat), misses, the current wait and its key wk (inputs must quote it).
// Events (t, d) — exactly what the host emitted:
//   draw {h:[4 cards]} · step {g,s,away,t} · tick {bo:[g]} · fire {g,bang} · shot {g,shot} · ret {g} · rt {g,rt} · end {g}
import { liveSeats, leader, idle, cleanName, num, ANIMAL_G } from "./lobby.js";

const GATE = 40000, RET = 9000;
// rough replay times (ms) of the app's animations, so gates aren't timed out before a seat even sees them
// (a page that reaches its own move says so — "ready" — and its clock restarts from then)
const A = { boot: 6000, card: 2000, drawEnd: 1800, pick: 5000, fireSelf: 3000, click: 2500, bang: 3500, shot: 2000, kill: 2500, retAim: 1500, shotB: 2500, blackout: 1800, redraw: 900 };

const aliveN = (sv) => sv.alive.reduce((a, b) => a + b, 0);
const bullets = (sv) => (aliveN(sv) === 2 && (sv.safe || 0) >= 4 ? 2 : 1);
const retB = (sv) => (aliveN(sv) === 2 ? 3 : Math.min(4, bullets(sv) + 1));
const safe = (sv) => { if (aliveN(sv) === 2) sv.safe = (sv.safe || 0) + 1; };
const seat = (T, g) => { const x = (T.seats || {})["s" + g]; return x && x.uid ? x : null; };
const human = (T, g) => (T.sv.away[g] ? null : seat(T, g));
const necked = (T, ctx, g) => { const x = seat(T, g); return !!(x && (ctx.looks[x.uid] || {}).neck); };
const later = (sv, ctx, ms) => { sv.clk = Math.max(sv.clk || 0, ctx.now) + ms; };

function emit(T, ctx, t, d) {
  const sv = T.sv, n = Math.max((sv.evn || 0) + 1, ctx.now);
  sv.evn = n;
  T.ev = (T.ev || []).concat({ n, t, d }).slice(-150);
}

/* ---------------- lobby requests (mpreq/{uid} with tb:"rr") ---------------- */
export function rrRequest(T, uid, q, ctx) {
  const ss = liveSeats(T, ctx, uid), me = ss.findIndex((x) => x && x.uid === uid), lead = leader(T, ctx, uid), play = T.state === "play";
  const no = (msg) => ({ ok: false, msg });
  T.seats = T.seats || {};
  switch (q.a) {
    case "join": {
      if (me >= 0) return { ok: true };
      if (play) return no("A game is in progress.");
      const k = String(q.k || ""), g = ANIMAL_G[k];
      if (g == null) return no("Pick an animal.");
      if (ss[g]) return no("Someone already took that animal.");
      for (let h = 0; h < 4; h++) if (T.seats["s" + h] && T.seats["s" + h].uid === uid) delete T.seats["s" + h];
      T.seats["s" + g] = { uid, k, stake: Math.max(0, num(q.stake)), at: ctx.now, n: cleanName(q.nm) };
      if (!lead) { T.host = uid; T.state = "lobby"; T.mode = T.mode || "same"; T.buyin = Math.max(0, num(q.stake)); }
      return { ok: true };
    }
    case "leave": {
      if (me < 0) return { ok: true };
      if (play) return no("A game is in progress.");
      delete T.seats["s" + me];
      if (lead === uid) { const nx = ss.find((x) => x && x.uid !== uid); T.host = nx ? nx.uid : null; }
      return { ok: true };
    }
    case "mode":
      if (lead !== uid || play) return no("Only the host can change that.");
      T.mode = q.mode === "own" ? "own" : "same"; T.buyin = Math.max(0, num(q.buyin));
      return { ok: true };
    case "nobots":
      if (lead !== uid || play) return no("Only the host can change that.");
      T.nobots = !T.nobots;
      return { ok: true };
    case "buyin":
      if (lead !== uid || play || T.mode === "own") return { ok: true };
      T.buyin = Math.max(0, num(q.v));
      return { ok: true };
    case "stake":
      if (me < 0 || play || T.mode !== "own") return { ok: true };
      T.seats["s" + me] = { ...T.seats["s" + me], stake: Math.max(0, num(q.v)) };
      return { ok: true };
    case "start": {
      if (lead !== uid) return no("Only the host can start the game.");
      if (play) return { ok: true };
      if (T.nobots && ss.filter(Boolean).length < 2) return no("No-bots needs at least 2 players.");
      const sm = T.mode !== "own", cutReq = new Set((Array.isArray(q.cut) ? q.cut : []).map(Number)), cut = [];
      ss.forEach((x, g) => { if (!x) return; const need = sm ? num(T.buyin) : num(x.stake); if (idle(ctx, x, uid) || !(need > 0) || cutReq.has(g)) cut.push(g); });
      if (cut.includes(me)) return no("You don't have enough BiggieBucks for that buy-in.");
      const quiet = cut.filter((g) => !cutReq.has(g) && idle(ctx, ss[g], uid)).map((g) => cleanName(ss[g].n));
      cut.forEach((g) => delete T.seats["s" + g]);
      const now = ctx.now, seats = [0, 1, 2, 3].map((g) => seat(T, g));
      Object.assign(T, { state: "play", gid: now, ev: [], at: now, host: uid, srv: true, ended: null, off: null,
        sv: { gid: now, ph: "draw", dl: 0, clk: now + A.boot, wk: 0, w: null, evn: 0, safe: 0, turn: 0, alive: [0, 1, 2, 3].map((g) => (T.nobots && !seats[g] ? 0 : 1)), away: {}, miss: {}, inSeen: (T.sv && T.sv.inSeen) || {} } });
      // remember every seat's stake for the record (each page pays and collects its own, as before)
      T.stakes = Object.fromEntries(seats.map((x, g) => [g, x ? (sm ? num(T.buyin) : num(x.stake)) : 0]));
      return { ok: true, msg: quiet.length ? `${quiet.join(", ")} ${quiet.length > 1 ? "weren't" : "wasn't"} at the table and sat this one out.` : null };
    }
  }
  return no("Unknown request.");
}

/* ---------------- waits ---------------- */
function openWait(T, ctx, w, ms) {
  const sv = T.sv;
  sv.wk = (sv.wk || 0) + 1;
  sv.w = { ...w, wk: sv.wk };
  sv.dl = Math.max(ctx.now, sv.clk || 0) + ms;
}
function closeWait(T) { const sv = T.sv; sv.w = null; sv.dl = 0; }

/* a gate was answered (x = the player's input) or timed out (x = null) */
function gateDone(T, ctx, x) {
  const sv = T.sv, w = sv.w, g = w.g;
  closeWait(T);
  let away = false;
  if (!x) { sv.miss[g] = (sv.miss[g] || 0) + 1; if (sv.miss[g] >= 2) { away = true; sv.away[g] = true; } }
  else sv.miss[g] = 0;
  if (w.s === "draw") {
    emit(T, ctx, "step", { g, s: "draw", away, t: null });
    if (x) sv.clk = ctx.now; later(sv, ctx, A.card);
    sv.di++;
    sv.ph = "dg";
  } else if (w.s === "pick") {
    emit(T, ctx, "step", { g, s: "pick", away, t: null });
    if (x) sv.clk = ctx.now; later(sv, ctx, A.pick);
    sv.ph = "fire";
  } else if (w.s === "fire") {
    if (x) sv.clk = ctx.now;
    const t = x && x.t && typeof x.t === "object" && x.t.aim ? x.t : null;
    let sh = null;
    if (t) { const tg = Number.isInteger(t.tg) && t.tg >= 0 && t.tg < 4 && t.tg !== g ? t.tg : null; sh = { aim: 1, tg, live: ctx.randN(5) < bullets(sv) }; }
    emit(T, ctx, "step", { g, s: "fire", away, t: sh });
    resolveShot(T, ctx, g, sh, true);
  }
}

/* the shot itself; hum = the turn was a real player's (a missing shot then means "at my own head") */
function resolveShot(T, ctx, g, sh, hum) {
  const sv = T.sv;
  if (!hum) {
    // a bot (or a seat that went quiet) turns the gun on someone 12% of the time; 70% aim, 92% at a stretched neck
    if (ctx.randN(100) < 12) {
      const o = [0, 1, 2, 3].filter((k) => k !== g && sv.alive[k]);
      if (o.length) { const b = o[ctx.randN(o.length)]; sh = { aimAt: b, tg: ctx.randN(100) < (necked(T, ctx, b) ? 92 : 70) ? b : null, live: ctx.randN(5) < bullets(sv) }; }
    }
  }
  if (sh) {
    if (sh.tg != null && !sv.alive[sh.tg]) sh.tg = null;
    emit(T, ctx, "shot", { g, shot: sh });
    later(sv, ctx, A.shot);
    if (sh.live && sh.tg != null) { sv.alive[sh.tg] = 0; sv.safe = 0; later(sv, ctx, A.kill); return afterTurn(T, ctx, true); }
    // misfire or a miss: everyone else draws on the shooter
    emit(T, ctx, "ret", { g });
    const need = [0, 1, 2, 3].filter((k) => k !== g && sv.alive[k] && human(T, k));
    sv.ph = "ret";
    if (!need.length) { sv.w = { s: "ret", G: g, need: [], got: {} }; return finishRet(T, ctx); }
    openWait(T, ctx, { s: "ret", G: g, need, got: {} }, RET);
    return;
  }
  const bang = ctx.randN(5) < bullets(sv);
  emit(T, ctx, "fire", { g, bang });
  if (!bang) { safe(sv); later(sv, ctx, A.click); return afterTurn(T, ctx, false); }
  sv.alive[g] = 0; sv.safe = 0; later(sv, ctx, A.bang);
  afterTurn(T, ctx, true);
}

function finishRet(T, ctx) {
  const sv = T.sv, w = sv.w, G = w.G, nb = retB(sv), out = [];
  for (const k of [0, 1, 2, 3]) {
    if (k === G || !sv.alive[k]) continue;
    if (w.need.includes(k)) {
      const r = w.got[k];
      out.push(r ? { g: k, fired: !!r.fired, live: !!r.fired && ctx.randN(5) < nb, hit: r.hit ? G : null } : { g: k, fired: false, live: false, hit: null });
    } else out.push({ g: k, live: ctx.randN(5) < nb, hit: ctx.randN(100) < (necked(T, ctx, G) ? 88 : 60) ? G : null });
  }
  closeWait(T);
  emit(T, ctx, "rt", { g: G, rt: out });
  later(sv, ctx, A.shotB);
  if (out.some((r) => r.live && r.hit === G)) { sv.alive[G] = 0; sv.safe = 0; later(sv, ctx, A.kill); return afterTurn(T, ctx, true); }
  safe(sv);
  afterTurn(T, ctx, false);
}

function afterTurn(T, ctx, died) {
  const sv = T.sv;
  if (aliveN(sv) <= 1) return end(T, ctx);
  if (died) { later(sv, ctx, A.redraw); sv.ph = "draw"; return; }
  sv.turn = (sv.turn + 1) % 4;
  sv.ph = "tick";
}
function end(T, ctx) {
  const sv = T.sv;
  emit(T, ctx, "end", { g: sv.alive.indexOf(1) });
  sv.ph = "over"; sv.w = null;
  sv.dl = Math.max(ctx.now, sv.clk || 0) + 5000;
}

/* ---------------- inputs (rrin/{uid}: {gid, n, s, t | r, wk}) ---------------- */
export function rrInput(T, uid, x, ctx) {
  const sv = T.sv;
  if (!sv || T.state !== "play" || sv.gid !== T.gid || num(x.gid) !== T.gid || !sv.w) return false;
  const w = sv.w;
  if (num(x.wk) !== w.wk) return false;
  if (x.s === "ready") { // their page just showed them this move: give them the full time from now
    if (x.st !== w.s) return false;
    if (w.s === "ret") {
      const g = w.need.find((k) => (seat(T, k) || {}).uid === uid);
      if (g == null || (w.rdy || {})[g]) return false;
      w.rdy = { ...(w.rdy || {}), [g]: 1 };
      sv.dl = Math.max(sv.dl || 0, ctx.now + RET - 1000);
      return true;
    }
    if ((seat(T, w.g) || {}).uid !== uid || w.rdy) return false;
    w.rdy = 1;
    sv.dl = Math.max(sv.dl || 0, ctx.now + GATE);
    return true;
  }
  if (x.s !== w.s) return false;
  if (w.s === "ret") {
    const g = w.need.find((k) => (seat(T, k) || {}).uid === uid);
    if (g == null || w.got[g]) return false;
    const r = x.r && typeof x.r === "object" ? x.r : {};
    w.got[g] = { fired: !!r.fired, hit: !!r.hit };
    if (w.need.every((k) => w.got[k])) finishRet(T, ctx);
    return true;
  }
  if ((seat(T, w.g) || {}).uid !== uid) return false;
  gateDone(T, ctx, x);
  return true;
}

/* ---------------- the game loop ---------------- */
export function rrAdvance(T, ctx) {
  const sv = T.sv;
  for (let guard = 0; guard < 400; guard++) {
    if (T.state !== "play" || !sv || sv.gid !== T.gid || sv.ph === "done") return;
    if (sv.dl && sv.dl > ctx.now) return;
    if (sv.w) { // the wait ran out
      if (sv.w.s === "ret") finishRet(T, ctx); else gateDone(T, ctx, null);
      continue;
    }
    sv.dl = 0;
    switch (sv.ph) {
      case "draw": {
        const deck = ctx.deck();
        const h = [0, 1, 2, 3].map((i) => { const v = deck[i]; return { r: v % 13, s: Math.floor(v / 13), v: (v % 13) * 4 + Math.floor(v / 13) }; });
        emit(T, ctx, "draw", { h });
        sv.hands = h.map((c) => c.v); sv.order = [0, 1, 2, 3].filter((g) => sv.alive[g]); sv.di = 0;
        later(sv, ctx, 300);
        sv.ph = "dg";
        break;
      }
      case "dg": { // everyone draws in seat order; real players reach for the deck themselves
        if (sv.di < sv.order.length) {
          const g = sv.order[sv.di];
          if (human(T, g)) { openWait(T, ctx, { s: "draw", g }, GATE); return; }
          later(sv, ctx, A.card); sv.di++;
          break;
        }
        let lo = sv.order[0];
        sv.order.forEach((g) => { if (sv.hands[g] < sv.hands[lo]) lo = g; });
        sv.turn = lo; later(sv, ctx, A.drawEnd);
        sv.ph = "tick";
        break;
      }
      case "tick": { // before each turn: who blacked out?
        for (let k = 0; k < 4 && !sv.alive[sv.turn]; k++) sv.turn = (sv.turn + 1) % 4;
        const bo = [0, 1, 2, 3].filter((g) => { const x = seat(T, g); return sv.alive[g] && x && (ctx.looks[x.uid] || {}).bo === T.gid; });
        emit(T, ctx, "tick", { bo });
        if (bo.length) {
          bo.forEach((g) => { sv.alive[g] = 0; sv.safe = 0; later(sv, ctx, A.blackout); });
          if (aliveN(sv) <= 1) { end(T, ctx); break; }
          later(sv, ctx, A.redraw); sv.ph = "draw";
          break;
        }
        sv.ph = "pick";
        break;
      }
      case "pick": // a real player's turn has two gates; whether it's theirs is fixed for the whole turn (as rlTurn did)
        sv.hum = !!human(T, sv.turn);
        if (sv.hum) { openWait(T, ctx, { s: "pick", g: sv.turn }, GATE); return; }
        later(sv, ctx, A.pick); sv.ph = "fire";
        break;
      case "fire":
        if (sv.hum && human(T, sv.turn)) { openWait(T, ctx, { s: "fire", g: sv.turn }, GATE); return; }
        later(sv, ctx, A.fireSelf);
        resolveShot(T, ctx, sv.turn, null, !!sv.hum); // went quiet at "pick": the gun still goes to their own head
        break;
      case "over":
        T.state = "lobby"; T.ended = T.gid; sv.ph = "done";
        return;
      default:
        return;
    }
  }
}

export function rrUids(T) {
  const s = new Set();
  for (const x of Object.values((T && T.seats) || {})) if (x && x.uid) s.add(x.uid);
  return [...s];
}
