// Texas Hold'em live table, run by the server. A port of the host-side code in public/index.html
// (thAct start/join/leave, thGame, thPlayHand, thAsk, thHostIn, thSeatChanges, thCashOuts) as a resumable
// state machine: every call runs as far as it can and stops at the next wait, recording it in T.sv
// (phase + absolute deadline). The public table state T.ps and the event list T.ev keep exactly the shapes
// the phone host wrote, so the app renders a server-run table with the same code.
//
// T   = thtable/live (public).  T.sv = server bookkeeping (phase, deadline, joins, misses, input dedupe).
// sec = mpsecret/th (clients can't read it): the deck and every seat's hole cards for the hand in play.
// ctx = { now, looks: {uid: rrlook doc}, rnd(), randN(n), deck(), holes: [], chat: [] } — holes/chat are
//       outputs the caller writes in the same transaction.
import { thEval, thPots, thAward, thLive, thNext, thFirstNeed, thLegal, thPut, thDo, thStreet, thBotMove } from "./thpure.js";
import { SEATBOT, ANIMAL_G, liveSeats, leader, idle, cleanName, num } from "./lobby.js";

export const TH_TURN = 30000;
const F4 = () => [false, false, false, false];
const STREETS = ["pre", "flop", "turn", "river"];
const blinds = (b) => ({ sb: Math.max(1, Math.floor(b / 100)), bb: Math.max(2, Math.floor(b / 50)) });
const limits = (H) => ({ mn: H.bb * 20, mx: Math.max(H.buy * 2, H.bb * 100) });
const oid = (H, g) => { const p = H && H.pl[g]; return (p && p.oid) || "g" + (H && H.gid); };
const running = (T, ctx) => !!(T && T.state === "play" && ctx.now - (T.at || 0) < 120000);
const liveN = (H) => thLive(H).filter(Boolean).length;
const fmt = (n) => Number(n || 0).toLocaleString("en-US");

function emit(T, ctx, t, extra) {
  const H = T.ps, sv = T.sv;
  const n = Math.max((sv.evn || 0) + 1, ctx.now);
  sv.evn = n;
  T.ev = (T.ev || []).concat({ n, t, la: H.la, seq: H.seq }).slice(-16);
  if (extra && extra.cash && Object.keys(extra.cash).length) T.cash = Object.assign({}, T.cash || {}, extra.cash);
}
/** The countdown the app shows: 30s while a real (not leaving) player is to act. */
export function thSeal(T) {
  const H = T.ps;
  if (!H) return;
  const p = H.toAct >= 0 ? H.pl[H.toAct] : null;
  H.dl = p && p.uid && !H.lv[H.toAct] ? TH_TURN : 0;
}
const blackedOut = (H, g, ctx) => { const p = H.pl[g]; if (!p || !p.uid) return false; const L = ctx.looks[p.uid]; return !!(L && L.bo === H.gid); };
const autoMove = (H, g) => ({ a: thLegal(H, g).canCheck ? "check" : "fold" });

/* ---------------- lobby requests (mpreq/{uid} with tb:"th") ---------------- */
export function thRequest(T, sec, uid, q, ctx) {
  const ss = liveSeats(T, ctx, uid), me = ss.findIndex((x) => x && x.uid === uid), lead = leader(T, ctx, uid), run = running(T, ctx);
  const no = (msg) => ({ ok: false, msg });
  T.seats = T.seats || {};
  switch (q.a) {
    case "join": {
      if (run) return no("A game is in progress.");
      if (me >= 0) return { ok: true };
      const k = String(q.k || ""), g = ANIMAL_G[k];
      if (g == null) return no("Pick an animal.");
      if (ss[g]) return no("Someone already took that animal.");
      for (let h = 0; h < 4; h++) if (T.seats["s" + h] && T.seats["s" + h].uid === uid) delete T.seats["s" + h];
      T.seats["s" + g] = { uid, k, at: ctx.now, n: cleanName(q.nm) };
      if (T.state === "play") { T.state = "lobby"; if (T.sv) T.sv.ph = "done"; }
      if (!lead) { T.host = uid; T.state = "lobby"; T.buyin = num(T.buyin) || 1000; }
      return { ok: true };
    }
    case "leave": {
      if (me < 0) return { ok: true };
      delete T.seats["s" + me];
      if (lead === uid) { const nx = ss.find((x) => x && x.uid !== uid); T.host = nx ? nx.uid : null; }
      return { ok: true };
    }
    case "nobots":
      if (lead !== uid || run) return no("Only the host can change that.");
      T.nobots = !T.nobots;
      return { ok: true };
    case "buyin": {
      if (lead !== uid || run) return no("Only the host can change the buy-in.");
      T.buyin = Math.max(0, num(q.v));
      return { ok: true };
    }
    case "start": {
      if (lead !== uid) return no("Only the host can start the game.");
      if (run) return no("A game is in progress.");
      const B = Math.max(0, num(T.buyin));
      if (!(B > 0)) return no("Set a buy-in first.");
      const cutReq = new Set((Array.isArray(q.cut) ? q.cut : []).map(Number));
      // who sits this one out: anyone whose page has gone quiet, plus whoever the host's page saw can't cover the buy-in
      const keep = [], cut = [];
      ss.forEach((x, g) => { if (!x) return; if (idle(ctx, x, uid) || cutReq.has(g)) cut.push(g); else keep[g] = x; });
      if (!keep[me]) return no("You don't have enough BiggieBucks for that buy-in.");
      if (T.nobots && keep.filter(Boolean).length < 2) return no("No-bots needs at least 2 players.");
      cut.forEach((g) => delete T.seats["s" + g]);
      const quiet = cut.filter((g) => !cutReq.has(g)).map((g) => cleanName(ss[g].n));
      const now = ctx.now, bl = blinds(B);
      const pl = [0, 1, 2, 3].map((g) => { const x = keep[g]; return x ? { uid: x.uid, k: x.k, n: cleanName(x.n), at: now + g } : T.nobots ? null : { bot: 1, k: SEATBOT[g].k, n: SEATBOT[g].n }; });
      const H = { gid: now, nobots: !!T.nobots, hand: 0, btn: -1, sb: bl.sb, bb: bl.bb, buy: B, pl, st: pl.map((p) => (p ? B : 0)), out: F4(), lv: F4(), np: F4(), seq: 0,
        inh: F4(), fo: F4(), ai: F4(), acted: F4(), ro: F4(), bet: [0, 0, 0, 0], tot: [0, 0, 0, 0], last: ["", "", "", ""], board: [], show: [null, null, null, null], hn: [null, null, null, null],
        win: null, pots: null, street: "wait", toAct: -1, la: -1, dl: 0, cur: 0, minR: bl.bb, sbs: -1, bbs: -1, log: "Shuffling up…", wnr: -1 };
      Object.assign(T, { state: "play", gid: now, ev: [], at: now, host: uid, ps: H, srv: true, ended: null,
        sv: { gid: now, ph: "start", dl: now + 1200, si: 0, g: -1, seq: 0, evn: 0, miss: [0, 0, 0, 0], joins: {}, inSeen: T.sv && T.sv.inSeen || {} } });
      for (const k of Object.keys(sec)) delete sec[k];
      return { ok: true, msg: quiet.length ? `${quiet.join(", ")} ${quiet.length > 1 ? "weren't" : "wasn't"} at the table and sat this one out.` : null };
    }
  }
  return no("Unknown request.");
}

/* ---------------- in-game inputs (thin/{uid}) — the host's thHostIn ---------------- */
export function thInput(T, sec, uid, x, ctx) {
  const H = T.ps, sv = T.sv;
  if (!H || !sv || T.state !== "play" || sv.gid !== T.gid || num(x.gid) !== H.gid) return false;
  const waitTable = sv.ph === "loop" && H.street === "wait";
  if (x.a === "sit") {
    sv.joins = sv.joins || {};
    sv.joins[uid] = { g: num(x.g), buy: num(x.buy), oid: String(x.oid || "").slice(0, 40), n: cleanName(x.nm) };
    if (waitTable) sv.dl = Math.min(sv.dl || 0, ctx.now);
    return true;
  }
  const g = H.pl.findIndex((p, k) => p && p.uid === uid && !H.out[k]);
  if (g < 0) return false;
  if (x.a === "stay") {
    if (H.lv[g] && !H.np[g]) { H.lv[g] = false; sv.miss[g] = 0; emit(T, ctx, "seat"); }
    return true;
  }
  if (x.a === "leave") {
    if (!H.lv[g]) { H.lv[g] = true; if (x.np) H.np[g] = true; emit(T, ctx, "seat"); }
    if (sv.ph === "human" && sv.g === g) { sv.miss[g] = 0; act(T, sec, ctx, g, autoMove(H, g)); }
    else if (waitTable) sv.dl = Math.min(sv.dl || 0, ctx.now);
    return true;
  }
  if (sv.ph !== "human" || sv.g !== g) return false;
  if (x.a === "bo") {
    if (blackedOut(H, g, ctx)) { act(T, sec, ctx, g, { a: "fold", bo: 1 }); return true; }
    return false;
  }
  if (num(x.seq) !== sv.seq) return false;
  sv.miss[g] = 0;
  act(T, sec, ctx, g, x.a === "auto" ? autoMove(H, g) : { a: String(x.a || ""), to: x.to == null ? null : Number(x.to) });
  return true;
}

/* ---------------- the game loop ---------------- */
export function thAdvance(T, sec, ctx) {
  const sv = T.sv;
  for (let guard = 0; guard < 100; guard++) {
    if (T.state !== "play" || !sv || sv.gid !== T.gid || !T.ps || sv.ph === "done") return;
    const H = T.ps;
    // a player who blacks out while it's their turn folds at once (the host polled for this)
    if (sv.ph === "human" && blackedOut(H, sv.g, ctx)) { act(T, sec, ctx, sv.g, { a: "fold", bo: 1 }); continue; }
    if (sv.dl && sv.dl > ctx.now) return;
    sv.dl = 0;
    switch (sv.ph) {
      case "start": sv.ph = "loop"; break;
      case "loop": loopStep(T, sec, ctx); break;
      case "bet": betStep(T, sec, ctx); break;
      case "bot": {
        const g = sv.g, hole = sec.hole && sec.hole[g];
        if (!handOk(T, sec)) { voidHand(T, ctx); break; }
        act(T, sec, ctx, g, thBotMove(H, g, hole, ctx.rnd) || autoMove(H, g));
        break;
      }
      case "human": {
        // the 30s clock ran out: check or fold; twice in a row and you're cashed out after the hand
        const g = sv.g;
        sv.miss[g] = (sv.miss[g] || 0) + 1;
        if (sv.miss[g] >= 2 && !H.lv[g]) H.lv[g] = true;
        act(T, sec, ctx, g, autoMove(H, g));
        break;
      }
      case "fin":
        T.state = "lobby"; T.ended = H.gid; sv.ph = "done";
        return;
      default:
        sv.ph = "loop";
    }
  }
}

const handOk = (T, sec) => sec && sec.gid === T.ps.gid && sec.hand === T.ps.hand && Array.isArray(sec.hole);

/* the deck is gone (shouldn't happen): void the hand and give everyone's chips in it back */
function voidHand(T, ctx) {
  const H = T.ps, sv = T.sv;
  H.st = H.st.map((x, g) => x + (H.tot[g] || 0));
  H.tot = [0, 0, 0, 0]; H.bet = [0, 0, 0, 0]; H.inh = F4(); H.fo = F4(); H.board = []; H.show = [null, null, null, null];
  H.toAct = -1; H.la = -1; H.street = "wait"; H.log = "That hand was voided and the chips went back.";
  emit(T, ctx, "seat");
  sv.ph = "loop"; sv.dl = ctx.now + 1500;
}

/* players who left, went quiet or ran out of chips get cashed out here, between hands */
function cashOuts(H, all, ctx) {
  const cash = {};
  let any = false;
  H.pl.forEach((p, g) => {
    if (!p || H.out[g]) return;
    if (p.bot) { if (H.st[g] <= 0 || all) { H.out[g] = true; any = true; } return; }
    if (all || H.lv[g] || H.st[g] <= 0) { cash[p.uid] = { gid: H.gid, amt: H.np[g] ? 0 : H.st[g], oid: oid(H, g), buy: p.buy || H.buy, at: ctx.now }; H.out[g] = true; H.st[g] = 0; any = true; }
  });
  return any ? cash : null;
}
/* between hands: cash out leavers/busted, seat joiners (a bot in that chair goes home), refill empty chairs with bots */
function seatChanges(T, ctx) {
  const H = T.ps, sv = T.sv, nob = H.nobots;
  const cash = cashOuts(H, false, ctx) || {};
  H.pl.forEach((p, g) => { if (p && p.bot && H.out[g] && !nob) { H.st[g] = H.buy; H.out[g] = false; } });
  for (const [uid, x] of Object.entries(sv.joins || {})) {
    delete sv.joins[uid];
    const g = num(x.g), p = H.pl[g], amt = num(x.buy), L = limits(H);
    const ok = g >= 0 && g < 4 && (!p || p.bot || H.out[g]) && !H.pl.some((q, k) => q && q.uid === uid && !H.out[k]) && amt >= L.mn && amt <= L.mx;
    if (!ok) { cash[uid] = { gid: H.gid, amt, oid: x.oid, buy: amt, at: ctx.now }; continue; }
    H.pl[g] = { uid, k: SEATBOT[g].k, n: cleanName(x.n), at: ctx.now, oid: x.oid, buy: amt };
    H.st[g] = amt; H.out[g] = false; H.lv[g] = false; H.np[g] = false; sv.miss[g] = 0;
  }
  if (!nob) H.pl.forEach((p, g) => { if (!p || H.out[g]) { H.pl[g] = { bot: 1, k: SEATBOT[g].k, n: SEATBOT[g].n }; H.st[g] = H.buy; H.out[g] = false; H.lv[g] = false; H.np[g] = false; } });
  return Object.keys(cash).length ? cash : null;
}

function loopStep(T, sec, ctx) {
  const H = T.ps, sv = T.sv;
  // nobody's dealing to an empty room: a real player whose page has been gone 2+ minutes while the table waits is cashed out
  if (H.street === "wait") H.pl.forEach((p, g) => { if (p && p.uid && !H.out[g] && !H.lv[g] && ctx.now - ((ctx.looks[p.uid] || {}).at || 0) > 120000 && ctx.now - (p.at || 0) > 120000) H.lv[g] = true; });
  const cash = seatChanges(T, ctx);
  if (cash) { H.log = ""; emit(T, ctx, "seat", { cash }); }
  const hum = [0, 1, 2, 3].filter((g) => H.pl[g] && H.pl[g].uid && !H.out[g]);
  if (!hum.length) return endGame(T, ctx);
  const alive = [0, 1, 2, 3].filter((g) => H.pl[g] && !H.out[g] && H.st[g] > 0);
  if (alive.length < 2) {
    if (H.street !== "wait" || H.log !== "Waiting for players…") { H.street = "wait"; H.log = "Waiting for players…"; H.toAct = -1; emit(T, ctx, "seat"); }
    sv.dl = ctx.now + 2500;
    return;
  }
  H.sit = [0, 1, 2, 3].map((g) => alive.includes(g) && blackedOut(H, g, ctx));
  if (alive.filter((g) => !H.sit[g]).length < 2) {
    const was = H.log;
    H.log = "Waiting for someone to come to… 🍺💀"; H.bof = H.sit.slice(); H.street = "wait";
    if (was !== H.log) emit(T, ctx, "seat");
    sv.dl = ctx.now + 3000;
    return;
  }
  if (!startHand(T, sec, ctx)) sv.dl = ctx.now + 1500;
}

/* thPlayHand up to the deal */
function startHand(T, sec, ctx) {
  const H = T.ps, sv = T.sv;
  const sit = (g) => !!H.pl[g] && H.st[g] > 0 && !H.out[g] && !(H.sit && H.sit[g]);
  const n0 = [0, 1, 2, 3].filter(sit).length;
  if (n0 < 2) return false;
  H.hand++; H.inh = [0, 1, 2, 3].map(sit); H.fo = F4(); H.ai = F4(); H.tot = [0, 0, 0, 0]; H.last = ["", "", "", ""]; H.board = [];
  H.show = [null, null, null, null]; H.hn = [null, null, null, null]; H.win = null; H.street = "pre"; H.toAct = -1; H.bof = [0, 1, 2, 3].map((g) => !!(H.sit && H.sit[g]));
  H.btn = thNext(H, H.btn < 0 ? 3 : H.btn, (g) => H.inh[g]);
  const nx = (g) => thNext(H, g, (k) => H.inh[k]);
  const sb = n0 === 2 ? H.btn : nx(H.btn), bb = nx(sb);
  H.sbs = sb; H.bbs = bb;
  thStreet(H); thPut(H, sb, H.sb); thPut(H, bb, H.bb); H.last[sb] = "SB"; H.last[bb] = "BB"; H.cur = H.bb; H.minR = H.bb;
  const deck = ctx.deck();
  let di = 0;
  const hole = [null, null, null, null];
  H.inh.forEach((x, g) => { if (x) hole[g] = [deck[di++], deck[di++]]; });
  for (const k of Object.keys(sec)) delete sec[k];
  Object.assign(sec, { gid: H.gid, hand: H.hand, deck, di, hole });
  hole.forEach((h, g) => { const p = H.pl[g]; if (h && p && p.uid) ctx.holes.push({ id: `${H.gid}_${p.uid}`, data: { gid: H.gid, h: H.hand, c: h, at: ctx.now } }); });
  H.la = -1; H.log = "New hand";
  emit(T, ctx, "deal");
  sv.ph = "bet"; sv.si = 0; sv.dl = ctx.now + 1300;
  return true;
}

/* start (or continue) the betting on street sv.si */
function betStep(T, sec, ctx) {
  const H = T.ps, sv = T.sv;
  if (!handOk(T, sec)) return voidHand(T, ctx);
  if (liveN(H) <= 1) return showdown(T, sec, ctx);
  const g = thFirstNeed(H, sv.si === 0 ? (H.bbs + 1) % 4 : (H.btn + 1) % 4);
  if (g >= 0) return ask(T, sec, ctx, g);
  nextStreet(T, sec, ctx);
}
function nextStreet(T, sec, ctx) {
  const H = T.ps, sv = T.sv, si = sv.si + 1;
  if (si >= 4) return showdown(T, sec, ctx);
  sv.si = si;
  thStreet(H); H.street = STREETS[si];
  for (let k = 0; k < (si === 1 ? 3 : 1); k++) H.board.push(sec.deck[sec.di++]);
  H.la = -1; H.log = H.street === "flop" ? "The flop" : H.street === "turn" ? "The turn" : "The river";
  emit(T, ctx, "board");
  sv.ph = "bet"; sv.dl = ctx.now + (si === 1 ? 1100 : 900);
}
/* thAsk: whose turn it is; bots think for a moment, real players get 30s */
function ask(T, sec, ctx, g) {
  const H = T.ps, sv = T.sv;
  H.toAct = g; H.seq++;
  emit(T, ctx, "turn");
  const p = H.pl[g];
  if (!p || H.lv[g]) return act(T, sec, ctx, g, autoMove(H, g));
  if (blackedOut(H, g, ctx)) return act(T, sec, ctx, g, { a: "fold", bo: 1 });
  sv.g = g;
  if (p.bot) { sv.ph = "bot"; sv.dl = ctx.now + 700 + Math.floor(ctx.rnd() * 1300); return; }
  sv.ph = "human"; sv.seq = H.seq; sv.dl = ctx.now + TH_TURN + 1500;
}
function act(T, sec, ctx, g, mv) {
  const H = T.ps, sv = T.sv;
  mv = mv || {};
  let lab = thDo(H, g, mv.a, mv.to) || thDo(H, g, thLegal(H, g).canCheck ? "check" : "fold");
  if (mv.bo && H.fo[g]) { lab = H.last[g] = "Blacked out and folded 🍺💀"; H.bof[g] = true; }
  H.toAct = -1; H.la = g; H.log = lab || ""; sv.g = -1; sv.ph = "bet"; sv.dl = 0;
  emit(T, ctx, "act");
  if (liveN(H) <= 1) return showdown(T, sec, ctx);
  const n = thFirstNeed(H, (g + 1) % 4);
  if (n >= 0) return ask(T, sec, ctx, n);
  nextStreet(T, sec, ctx);
}
function showdown(T, sec, ctx) {
  const H = T.ps, sv = T.sv, hole = sec.hole || [];
  const live = thLive(H), nl = live.filter(Boolean).length, pots = thPots(H.tot, live);
  let score = live.map((x) => (x ? 1 : 0));
  if (nl > 1) score = live.map((x, g) => { if (!x) return -1; const e = thEval(hole[g].concat(H.board)); H.show[g] = hole[g]; H.hn[g] = e.n; return e.v; });
  const win = thAward(pots, score, H.btn);
  H.street = "show"; H.win = win; H.pots = pots.map((p) => p.amt); win.forEach((w, g) => { H.st[g] += w; });
  H.tot = [0, 0, 0, 0]; H.bet = [0, 0, 0, 0]; H.cur = 0; H.toAct = -1; H.la = -1; H.log = "win";
  emit(T, ctx, "win");
  sv.ph = "loop"; sv.g = -1; sv.dl = ctx.now + (nl > 1 ? 5200 : 2400);
  // big pots and showdowns make the league chat
  const pot = (H.pots || []).reduce((a, b) => a + b, 0), wg = H.win.indexOf(Math.max(...H.win)), wp = wg >= 0 && H.pl[wg];
  if (wp && wp.uid && pot >= H.buy * 1.5) ctx.chat.push({ type: "bet", uid: wp.uid, poster: wp.uid, at: ctx.now, text: `♠️ ${wp.n} dragged a ${fmt(pot)} BB pot at the live Texas Hold'em table${H.hn[wg] ? " with " + H.hn[wg] : ""}.` });
}
function endGame(T, ctx) {
  const H = T.ps, sv = T.sv;
  const left = [0, 1, 2, 3].filter((g) => H.pl[g] && !H.out[g] && H.st[g] > 0);
  H.wnr = left.length === 1 ? left[0] : -1;
  const cash = cashOuts(H, true, ctx) || {};
  H.street = "end"; H.toAct = -1; H.la = -1;
  const w = H.wnr >= 0 ? H.pl[H.wnr] : null;
  H.log = w ? `${w.n} has every chip.` : "Game over.";
  emit(T, ctx, "end", { cash });
  const n = [0, 1, 2, 3].filter((g) => H.pl[g]).length;
  if (w && w.uid && n > 1) ctx.chat.push({ type: "bet", uid: w.uid, poster: w.uid, at: ctx.now, text: `♠️ ${w.n} took every chip at the live Texas Hold'em table (${fmt(H.buy * n)} BB in play).` });
  sv.ph = "fin"; sv.dl = ctx.now + 4000;
}

/** uids whose rrlook doc the engine may consult (seated players, and anyone in the table's player list). */
export function thUids(T) {
  const s = new Set();
  for (const x of Object.values((T && T.seats) || {})) if (x && x.uid) s.add(x.uid);
  for (const p of ((T && T.ps && T.ps.pl) || [])) if (p && p.uid) s.add(p.uid);
  return [...s];
}
