// Slot machine return-to-player, computed exactly from the constants in public/index.html.
// Oct 29 (Card System V2 brief): per-reel strips SL_WR make every winning combo ≈2.5% more often (lines ≈96.4%) and 1.5% of every bet
// feeds the progressive pot (was 1%): ≈97.9% in total.
import fs from "node:fs";
import assert from "node:assert/strict";
const html = fs.readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
const line = html.match(/const SL_SYM=.*?;\n/)[0];
const fn = html.match(/function slMult\(r\)\{.*?\n/)[0];
const { SL_WR, slMult, slRule } = new Function(line + fn + "return {SL_WR,slMult,slRule};")();
const T = SL_WR.map(w => w.reduce((a, b) => a + b, 0));
const ev = R => { const T = R.map(w => w.reduce((a, b) => a + b, 0)), o = {}; let rtp = 0, hit = 0;
  for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) for (let c = 0; c < 7; c++) {
    const p = R[0][a] / T[0] * R[1][b] / T[1] * R[2][c] / T[2], [m, k] = slRule([a, b, c]); if (k) o[k] = (o[k] || 0) + p; rtp += p * m; if (m > 0) hit += p }
  return { rtp, hit, o } };
const now = ev(SL_WR), old = ev([[12,6,5,4,3,2,1],[12,6,5,4,3,2,1],[12,6,5,4,3,2,1]]);
console.log(`lines RTP ${(now.rtp * 100).toFixed(4)}% (was ${(old.rtp * 100).toFixed(4)}%) · hit rate ${(now.hit * 100).toFixed(2)}% (was ${(old.hit * 100).toFixed(2)}%)`);
for (const k of Object.keys(old.o)) { const f = now.o[k] / old.o[k]; console.log(`  ${k.padEnd(5)} 1 in ${Math.round(1 / now.o[k]).toLocaleString().padStart(7)} (×${f.toFixed(4)})`); assert.ok(f > 1.02 && f < 1.03, k + " ≈2.5% more often") }
const jr = Number(html.match(/SL_JP_RATE=([.\d]+)/)[1]) + Number(html.match(/SL_JP_ADD=([.\d]+)/)[1]);
console.log(`lines ${(now.rtp * 100).toFixed(4)}% + jackpot ${(jr * 100).toFixed(2)}% = ${((now.rtp + jr) * 100).toFixed(4)}%`);
assert.ok(now.rtp + jr > 0.975 && now.rtp + jr < 0.983, "RTP about 97.9%");
console.log("slots ok");
// 5 paylines: Monte Carlo of how often a spin wins something / makes a profit (RTP per line is the exact number above)
{ const pick = i => { let x = Math.random() * T[i]; for (let k = 0; k < 7; k++) { x -= SL_WR[i][k]; if (x < 0) return k } return 0 };
  const LINES = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]]; let N = 400000, ret = 0, any = 0, prof = 0;
  for (let i = 0; i < N; i++) { const g = [0,1,2].map(j => [pick(j), pick(j), pick(j)]); const M = LINES.reduce((a, L) => a + slMult(L.map((r, j) => g[j][r])), 0);
    ret += M / 5; if (M > 0) any++; if (M > 5) prof++ }
  console.log(`5 lines (MC): return ${(ret / N * 100).toFixed(2)}% · something back ${(any / N * 100).toFixed(1)}% · profit ${(prof / N * 100).toFixed(1)}% of spins`);
  assert.ok(Math.abs(ret / N - now.rtp) < 0.01) }
