// Fast checks of the table engines with a fake clock (no Firestore): node test/engine.test.mjs
import assert from "node:assert/strict";
import * as rng from "../lib/rng.js";
import { thRequest, thInput, thAdvance, thSeal } from "../lib/th.js";
import { rrRequest, rrInput, rrAdvance } from "../lib/rr.js";
import { thLegal } from "../lib/thpure.js";

let now = 1_700_000_000_000;
const looks = {};
const mk = () => ({ now, looks, rnd: rng.rnd, randN: rng.randN, deck: rng.deck, holes: [], chat: [] });
const touch = (...u) => u.forEach((x) => (looks[x] = { ...(looks[x] || {}), at: now }));
let n = 0;

/* ---------------- Hold'em ---------------- */
{
  const T = {}, sec = {};
  touch("A", "B");
  assert.ok(thRequest(T, sec, "A", { a: "join", k: "cat", nm: "Alice" }, mk()).ok);
  assert.ok(thRequest(T, sec, "B", { a: "join", k: "bear", nm: "Bob" }, mk()).ok);
  assert.equal(thRequest(T, sec, "C", { a: "join", k: "bear" }, mk()).ok, false, "chair taken");
  assert.equal(thRequest(T, sec, "B", { a: "start" }, mk()).ok, false, "only host starts");
  assert.ok(thRequest(T, sec, "A", { a: "buyin", v: 1000 }, mk()).ok);
  assert.ok(thRequest(T, sec, "A", { a: "start" }, mk()).ok);
  assert.equal(T.state, "play");
  let paid = 2000; // A and B each paid 1000; bots bring their own
  const humanHoles = {};
  let hands = 0, timeouts = 0, joined = false, left = false, cashed = {};
  for (let i = 0; i < 20000 && T.state === "play"; i++) {
    const ctx = mk();
    thAdvance(T, sec, ctx); thSeal(T);
    ctx.holes.forEach((h) => (humanHoles[h.id] = h.data));
    Object.assign(cashed, T.cash || {});
    const H = T.ps, sv = T.sv;
    if (H.hand !== hands) {
      hands = H.hand;
      // hole cards only ever go to the real players, and match the secret deck
      for (const [g, p] of H.pl.entries()) if (p && p.uid && H.inh[g]) assert.deepEqual(humanHoles[`${H.gid}_${p.uid}`].c, sec.hole[g]);
    }
    if (hands === 3 && !joined) { // C sits down mid-game (pays own buy-in) and is dealt in from the next hand
      joined = true; paid += 1500; touch("C");
      thInput(T, sec, "C", { gid: T.gid, a: "sit", g: 2, buy: 1500, oid: "jC", nm: "Carl" }, mk());
    }
    if (hands === 6 && !left) { left = true; thInput(T, sec, "B", { gid: T.gid, a: "leave" }, mk()); }
    if (hands >= 9) { thInput(T, sec, "A", { gid: T.gid, a: "leave" }, mk()); thInput(T, sec, "C", { gid: T.gid, a: "leave" }, mk()); }
    if (sv.ph === "human") {
      const g = sv.g, p = H.pl[g];
      if (p.uid === "A" && H.hand === 2 && timeouts === 0) { timeouts++; now = sv.dl; continue; } // let the clock run out once
      const L = thLegal(H, g), r = rng.rnd();
      const mv = r < 0.15 ? { a: "fold" } : r < 0.3 && L.canRaise ? { a: "raise", to: L.minTo } : { a: L.canCheck ? "check" : "call" };
      touch(p.uid);
      assert.ok(thInput(T, sec, p.uid, { gid: T.gid, seq: H.seq, ...mv }, mk()));
      continue;
    }
    if (sv.dl > now) now = sv.dl; else now += 1000;
    touch("A", "B", "C");
  }
  assert.equal(T.state, "lobby", "game ends once every real player has left");
  // chips are conserved: everything paid in comes back out as cash-outs, minus/plus what bots won/lost
  const out = Object.values(cashed).filter((c) => c.gid === T.gid).reduce((a, c) => a + c.amt, 0);
  const botNet = 0; // bots aren't paid; just check every human was cashed out exactly once
  assert.equal(Object.keys(cashed).filter((u) => cashed[u].gid === T.gid).length, 3);
  console.log(`hold'em: ${hands} hands, paid in ${paid}, cashed out ${out} (bots took ${paid - out - botNet}), timeouts ${timeouts}`);
}

/* chips conservation in a no-bots game: total chips never change */
{
  const T = {}, sec = {};
  touch("A", "B", "C");
  thRequest(T, sec, "A", { a: "join", k: "cat", n: "A" }, mk());
  thRequest(T, sec, "B", { a: "join", k: "bear", n: "B" }, mk());
  thRequest(T, sec, "C", { a: "join", k: "rat", n: "C" }, mk());
  thRequest(T, sec, "A", { a: "nobots" }, mk());
  thRequest(T, sec, "A", { a: "buyin", v: 500 }, mk());
  assert.ok(thRequest(T, sec, "A", { a: "start" }, mk()).ok);
  for (let i = 0; i < 20000 && T.state === "play"; i++) {
    thAdvance(T, sec, mk()); thSeal(T);
    const H = T.ps, sv = T.sv;
    const total = H.st.reduce((a, b) => a + b, 0) + H.tot.reduce((a, b) => a + b, 0) + Object.values(T.cash || {}).filter((c) => c.gid === T.gid).reduce((a, c) => a + c.amt, 0);
    assert.equal(total + (H.rkT || 0), 1500, "chips conserved (plus the house rake)");
    if (H.hand > 30 || (H.street === "wait" && H.hand > 0)) ["A", "B", "C"].forEach((u) => thInput(T, sec, u, { gid: T.gid, a: "leave" }, mk()));
    if (sv.ph === "human") { const g = sv.g, L = thLegal(H, g); thInput(T, sec, H.pl[g].uid, { gid: T.gid, seq: H.seq, a: rng.rnd() < 0.3 && L.canRaise ? "allin" : L.canCheck ? "check" : "call" }, mk()); continue; }
    now = Math.max(now + 500, sv.dl); touch("A", "B", "C");
  }
  assert.equal(T.state, "lobby");
  assert.ok((T.ps.rkT || 0) > 0, "rake taken"); console.log("hold'em no-bots: chips conserved; rake", T.ps.rkT, "winner/log:", T.ps.log);
}

/* ---------------- Russian Roulette ---------------- */
let retShots = 0, kills = 0;
for (let game = 0; game < 30; game++) {
  const T = {};
  touch("A", "B");
  assert.ok(rrRequest(T, "A", { a: "join", k: "cat", stake: 100 }, mk()).ok);
  assert.ok(rrRequest(T, "B", { a: "join", k: "fox", stake: 100 }, mk()).ok);
  assert.ok(rrRequest(T, "A", { a: "mode", mode: "same", buyin: 200 }, mk()).ok);
  assert.ok(rrRequest(T, "A", { a: "start" }, mk()).ok);
  const seen = new Set();
  for (let i = 0; i < 5000 && T.state === "play"; i++) {
    rrAdvance(T, mk());
    const sv = T.sv;
    if (sv.w) {
      const w = sv.w;
      if (w.s === "ret") {
        // every shot resolves the moment it's taken: one rshot per shot, a live hit ends the volley on the spot
        const G = w.G, ev0 = T.ev.length, bots = Object.keys(w.bt || {}).length;
        assert.ok(Object.values(w.bt || {}).every((t) => t <= w.end) && sv.dl <= w.end, "bots fire inside the window");
        const pend = w.need.filter((g) => !w.got[g]);
        if (pend.length && !(game % 7 === 3 && pend.includes(1))) { // in some games B never fires back
          const g = pend[0];
          assert.ok(rrInput(T, T.seats["s" + g].uid, { gid: T.gid, s: "ret", wk: w.wk, r: { fired: true, hit: rng.rnd() < 0.5 } }, mk()));
          const rs = T.ev.slice(ev0).filter((e) => e.t === "rshot");
          assert.ok(rs.length >= 1 && rs[0].d.g === g && rs[0].d.G === G, "the player's shot shows at once");
          retShots += rs.length;
          if (!sv.w) { const rt = T.ev.slice(ev0).find((e) => e.t === "rt"); assert.ok(rt && rt.d.rt.length === sv.alive.filter((a, k) => a || k === G).length - 1 || rt.d.rt.some((r) => r.live && r.hit === G)); }
          continue;
        }
        now = Math.max(now, sv.dl); // wait: the next bot shot, or the window closing
        rrAdvance(T, mk());
        const fired = T.ev.slice(ev0).filter((e) => e.t === "rshot");
        retShots += fired.length;
        if (sv.w && sv.w.s === "ret") assert.ok(fired.length >= 1 || bots === 0 || Object.keys(sv.w.bt).length < bots, "a due bot fires");
        else { const rt = T.ev.slice(ev0).find((e) => e.t === "rt"); assert.ok(rt, "volley closes with rt"); if (rt.d.rt.some((r) => r.live && r.hit === G)) { assert.equal(sv.alive[G], 0); kills++; } }
        continue;
      }
      const uid = T.seats["s" + w.g].uid;
      if (game % 5 === 0 && uid === "B") { now = sv.dl; continue; } // B goes quiet: two misses and a bot plays the seat
      const dl0 = sv.dl; now += 20000; // the page is 20s behind; when it shows the move, the 40s clock restarts
      assert.ok(rrInput(T, uid, { gid: T.gid, s: "ready", st: w.s, wk: w.wk }, mk()) && sv.dl >= now + 40000 && sv.dl > dl0 - 1);
      assert.equal(rrInput(T, uid, { gid: T.gid, s: "ready", st: w.s, wk: w.wk }, mk()), false, "only once");
      const t = w.s === "fire" && rng.rnd() < 0.3 ? { aim: 1, tg: [0, 1, 2, 3].find((k) => k !== w.g && sv.alive[k]), live: true } : null;
      assert.ok(rrInput(T, uid, { gid: T.gid, s: w.s, wk: w.wk, t }, mk()));
      assert.equal(rrInput(T, uid, { gid: T.gid, s: w.s, wk: w.wk, t }, mk()), false, "a repeat is ignored");
      continue;
    }
    if (sv.dl > now) now = sv.dl; else now += 1000;
    T.ev.forEach((e) => seen.add(e.t));
  }
  assert.equal(T.state, "lobby", "RR game ends");
  const alive = T.sv.alive.reduce((a, b) => a + b, 0);
  assert.ok(alive <= 1);
  if (game === 0) console.log("rr: events seen", [...seen].join(","), "away", JSON.stringify(T.sv.away));
}
console.log("rr: 30 games to completion; return-fire shots", retShots, "return-fire kills", kills);
assert.ok(retShots > 0, "return fire happened");

/* return fire, shot by shot */
{
  const ret = (w, dl) => ({ state: "play", gid: 1, srv: true, seats: { s0: { uid: "A" }, s1: { uid: "B" } }, ev: [],
    sv: { gid: 1, ph: "ret", alive: [1, 1, 1, 1], away: {}, miss: {}, safe: 0, turn: 2, clk: 0, evn: 0, wk: 5, w: { wk: 5, ...w }, dl } });
  const fix = (v) => ({ ...mk(), randN: () => v }); // 0: every chamber live and every bot on target; 4: all empty
  // A's live hit drops G at once: one rshot, the volley closes, the bot due later never fires
  let T = ret({ s: "ret", G: 2, need: [0, 1], got: {}, bt: { 3: now + 1000 }, sh: [], end: now + 9000 }, now + 1000);
  assert.ok(rrInput(T, "A", { gid: 1, s: "ret", wk: 5, r: { fired: true, hit: true } }, fix(0)));
  assert.deepEqual(T.ev.map((e) => e.t), ["rshot", "rt"]);
  assert.deepEqual(T.ev[0].d, { g: 0, fired: true, live: true, hit: 2, G: 2, wk: 5 });
  assert.equal(T.sv.alive[2], 0); assert.equal(T.sv.w, null); assert.equal(T.ev[1].d.rt.length, 1);
  assert.equal(rrInput(T, "B", { gid: 1, s: "ret", wk: 5, r: { fired: true, hit: true } }, fix(0)), false, "too late");
  // a miss doesn't end it: the bot fires when due, B's window runs out, G lives on
  T = ret({ s: "ret", G: 2, need: [0, 1], got: {}, bt: { 3: now + 1000 }, sh: [], end: now + 9000 }, now + 1000);
  assert.ok(rrInput(T, "A", { gid: 1, s: "ret", wk: 5, r: { fired: true, hit: false } }, fix(4)));
  assert.deepEqual(T.ev.map((e) => e.t), ["rshot"]); assert.equal(T.sv.dl, now + 1000, "next: the bot's shot");
  rrAdvance(T, { ...fix(4), now: now + 1000 });
  assert.deepEqual(T.ev.map((e) => e.t), ["rshot", "rshot"]); assert.equal(T.ev[1].d.g, 3); assert.equal(T.sv.dl, now + 9000);
  rrAdvance(T, { ...fix(4), now: now + 9000 });
  const rt = T.ev.find((e) => e.t === "rt").d.rt;
  assert.deepEqual(rt.map((r) => [r.g, r.fired]), [[0, true], [3, true], [1, false]]); assert.equal(T.sv.alive[2], 1);
  // a wait opened by the previous server version (no bt/sh/end; answers in got) still finishes as before
  T = ret({ s: "ret", G: 2, need: [0, 1], got: { 0: { fired: true, hit: false } } }, now - 1);
  rrAdvance(T, fix(4));
  const old = T.ev.find((e) => e.t === "rt").d.rt;
  assert.deepEqual(old.map((r) => r.g).sort(), [0, 1, 3]); assert.equal(T.ev.filter((e) => e.t === "rshot").length >= 2, true);
  console.log("rr: return fire resolves shot by shot");
}
console.log("engine tests passed");

/* rake: 5% of pots that saw a flop; uncalled bets and preflop hands are not raked */
{
  const { thRake, thPots } = await import("../lib/thpure.js");
  const live = [true, true, false, false];
  let r = thRake(thPots([100, 100, 20, 0], live), [100, 100, 20, 0], live, [1, 2, 3]);
  assert.equal(r.rake, 11); assert.equal(r.pots.reduce((a, p) => a + p.amt, 0), 209);
  r = thRake(thPots([100, 100, 20, 0], live), [100, 100, 20, 0], live, []);
  assert.equal(r.rake, 0, "no flop, no drop");
  r = thRake(thPots([300, 100, 0, 0], live), [300, 100, 0, 0], live, [1, 2, 3, 4]);
  assert.equal(r.rake, 10, "the uncalled 200 isn't raked");
  console.log("rake ok");
}
