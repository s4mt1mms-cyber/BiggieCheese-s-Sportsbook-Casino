// Unit tests for the Multiverse card abilities' pure math, pulled straight out of public/index.html.
// Run: node tools/test/mv-abilities.test.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const html = readFileSync(fileURLToPath(new URL("../../public/index.html", import.meta.url)), "utf8");
const pure = html.slice(html.indexOf("/* MV-PURE-BEGIN"), html.indexOf("/* MV-PURE-END */"));
const spots = html.match(/const CR_SPOTS=\{[^\n]*\};/)[0];
const r0 = html.indexOf("function crResolve("), r1 = html.indexOf("return{B,cash,np,msg,wins,losses,s}}", r0) + "return{B,cash,np,msg,wins,losses,s}}".length;
assert.ok(pure.length > 100 && r0 > 0 && r1 > r0, "couldn't find the code to test");
const M = new Function(`${pure}\n${spots}\n${html.slice(r0, r1)}\nreturn{crDeanF,crF,CR_EDGE,tiPullAmt,tiSplit,tiOwed,rlRespinNet,crResolve};`)();

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok -", name); };
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

/* ---------- Craps Dean Strow: exact expected value per bet type = +1.6% ---------- */
const W = { 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3 };
const exact = [
  ["pass", 244 / 495, 251 / 495, 1, "pass"], ["come", 244 / 495, 251 / 495, 1, "come"], ["c6", 244 / 495, 251 / 495, 1, "c6"],
  ["dont", 949 / 1980, 976 / 1980, 1, "dont"], ["dcome", 949 / 1980, 976 / 1980, 1, "dcome"],
  ["field", 19 / 36, 20 / 36, 1, "field"], ["any7", 6 / 36, 30 / 36, 4, "any7"], ["craps", 4 / 36, 32 / 36, 7, "craps"], ["yo", 2 / 36, 34 / 36, 15, "yo"],
];
for (const x of [4, 5, 6, 8, 9, 10]) {
  const w = W[x];
  exact.push([`odds on ${x}`, w / (w + 6), 6 / (w + 6), { 4: 2, 10: 2, 5: 1.5, 9: 1.5, 6: 1.2, 8: 1.2 }[x], "odds", x]);
  exact.push([`place ${x}`, w / (w + 6), 6 / (w + 6), { 4: 1.8, 10: 1.8, 5: 1.4, 9: 1.4, 6: 7 / 6, 8: 7 / 6 }[x], "p" + x]);
}
ok("craps edge factors give exactly +1.6% per bet type", () => {
  for (const [name, pw, pl, m, k, pt] of exact) {
    const f = M.crDeanF(k, pt);
    assert.ok(f > 1 && f < 1.4, `${name} factor ${f}`);
    near(pw * m * f - pl, 0.016, 1e-12, name);
  }
  // the base game really is house-favoured, so the factor is a boost, not a cut
  for (const [name, pw, pl, m] of exact) assert.ok(pw * m - pl <= 1e-12, `${name} base EV`);
  assert.equal(M.crDeanF("nope", 4), 1);
});

ok("pass-line/don't/field/odds factors match +1.6%", () => {
  near(M.crDeanF("pass"), (0.016*495+251) / 244, 1e-12, "pass");
  near(M.crDeanF("dont"), (0.016*1980+976) / 949, 1e-12, "dont");
  near(M.crDeanF("field"), (0.016*36+20) / 19, 1e-12, "field");
  for (const x of [4, 5, 6, 8, 9, 10]) near(M.crDeanF("odds", x), 1 + 0.016 / (6 / (W[x] + 6)), 1e-12, "odds " + x);
});

/* Monte Carlo through the real crResolve with the edge on: each bet resolves at ~+1.6% (and at the normal house edge with it off) */
let seed = 0x9e3779b9; // mulberry32: a decent fixed-seed generator so the run is repeatable
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
const die = () => 1 + Math.floor(rnd() * 6);
function play(k, dean, V) {
  // returns the profit of one resolved bet of V on spot k (Come/Don't Come share the line bets' factors, checked exactly above)
  let point = null;
  if (k.startsWith("odds")) point = Number(k.slice(4));
  if (/^p\d+$/.test(k)) point = 4; // place bets only work while a point is on
  const key = k.startsWith("odds") ? "odds" : k;
  let B = { [key]: V };
  for (let i = 0; i < 1000; i++) {
    const a = die(), b = die(), s = a + b;
    const r = M.crResolve(B, point, a, b, dean);
    if (key === "dont" && point == null && s === 12) return 0; // come-out 12: push
    if (key === "pass" || key === "dont") {
      if (r.cash > 0) return r.cash;               // line bets stay up after a win: cash is the profit
      if (!r.B[key]) return -V;
      point = r.np; B = r.B; continue;
    }
    if (key === "odds") { if (r.cash > 0) return r.cash - V; if (!r.B.odds) return -V; continue; }
    if (/^p\d+$/.test(key)) { if (r.cash > 0) return r.cash; if (!r.B[key]) return -V; continue; }
    return r.cash - V; // one-roll bets
  }
  throw new Error("didn't resolve");
}
ok("Monte Carlo through crResolve: +1.6% with the card, house edge without", () => {
  const N = 300000, V = 1000000;
  for (const k of ["pass", "dont", "field", "any7", "craps", "yo", "odds4", "odds6", "p4", "p5", "p6"]) {
    let on = 0, off = 0;
    for (let i = 0; i < N; i++) on += play(k, true, V);
    for (let i = 0; i < N; i++) off += play(k, false, V);
    const evOn = on / N / V, evOff = off / N / V;
    // standard error of a single bet is at most ~sqrt(15) for Yo; allow 4 sigma
    const tol = 4 * (k === "yo" ? 3.9 : k === "craps" ? 2.7 : k === "any7" ? 2.1 : 1.3) / Math.sqrt(N);
    near(evOn, 0.016, tol, k + " with Dean");
    assert.ok(evOff < 0.016 - 0.005, `${k} without Dean should lose (${evOff})`);
  }
});

/* ---------- Curse tithe math ---------- */
ok("pull tithe = floor(10% of balance), nothing on zero or negative", () => {
  assert.equal(M.tiPullAmt(123459), 12345);
  assert.equal(M.tiPullAmt(9), 0);
  assert.equal(M.tiPullAmt(0), 0);
  assert.equal(M.tiPullAmt(-500), 0);
});
ok("split: whole BB each, remainder reported", () => {
  assert.deepEqual(M.tiSplit(12345, 2), { each: 6172, paid: 12344, left: 1 });
  assert.deepEqual(M.tiSplit(1000, 9), { each: 111, paid: 999, left: 1 });
  assert.deepEqual(M.tiSplit(5, 9), { each: 0, paid: 0, left: 5 });
  assert.deepEqual(M.tiSplit(100, 0), { each: 0, paid: 0, left: 100 });
});
ok("owed from winnings = floor(tiWin/10) − already paid, and repeated settlements never pay a BB twice", () => {
  assert.equal(M.tiOwed(10009, 0), 1000);
  assert.equal(M.tiOwed(10009, 999), 1);
  // simulate wins and settlements to 9 players: everything paid + still owed == floor(total/10)
  let tiWin = 0, paid = 0;
  for (let i = 1; i <= 500; i++) {
    tiWin += (i * 37) % 2501;
    const owed = M.tiOwed(tiWin, paid), sp = M.tiSplit(owed, 9);
    if (sp.each > 0 && i % 7 === 0) paid += sp.paid;
    assert.equal(paid + M.tiOwed(tiWin, paid), Math.floor(tiWin / 10));
    assert.ok(M.tiOwed(tiWin, paid) >= 0);
  }
});

/* ---------- King Slop respin ---------- */
ok("respin: the voided spin's net is taken back, only the new spin counts", () => {
  const start = 5000, lost = -300, again = 700;
  const afterFirst = start + lost;
  assert.equal(M.rlRespinNet(afterFirst, lost, again), start + again);
  assert.equal(M.rlRespinNet(afterFirst, lost, -300), start - 300); // second result is final, even another loss
  assert.equal(M.rlRespinNet(M.rlRespinNet(afterFirst, lost, -50), -50, 0), start); // respin twice
});

console.log(`\n${n} tests passed`);
