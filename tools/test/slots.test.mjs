// Slot machine return-to-player, computed exactly from the constants in public/index.html (owner: standard casino edge ≈ 5%).
import fs from "node:fs";
import assert from "node:assert/strict";
const html = fs.readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
const line = html.match(/const SL_SYM=.*?;\n/)[0];
const fn = html.match(/function slMult\(r\)\{.*?\n/)[0];
const ctx = new Function(line + fn + "return {SL_W,SL_PAY,slMult};")();
const { SL_W, slMult } = ctx, T = SL_W.reduce((a, b) => a + b, 0);
let rtp = 0, hit = 0;
for (let a = 0; a < SL_W.length; a++) for (let b = 0; b < SL_W.length; b++) for (let c = 0; c < SL_W.length; c++) {
  const p = SL_W[a] * SL_W[b] * SL_W[c] / T ** 3, m = slMult([a, b, c]); rtp += p * m; if (m > 0) hit += p;
}
console.log(`RTP ${(rtp * 100).toFixed(4)}% · hit rate ${(hit * 100).toFixed(2)}%`);
// the progressive pot returns SL_JP_RATE (1%) of every bet over time on top of the line pays
const jr = Number(html.match(/SL_JP_RATE=([.\d]+)/)[1]);
console.log(`base ${(rtp * 100).toFixed(4)}% + jackpot ${(jr * 100).toFixed(2)}% = ${((rtp + jr) * 100).toFixed(4)}%`);
assert.ok(rtp + jr > 0.945 && rtp + jr < 0.955, "house edge about 5%");
console.log("slots ok");
// 5 paylines: Monte Carlo of how often a spin wins something / makes a profit (RTP per line is the exact number above)
{ const W = SL_W, pick = () => { let x = Math.random() * T; for (let k = 0; k < W.length; k++) { x -= W[k]; if (x < 0) return k } return 0 };
  const LINES = [[1,1,1],[0,0,0],[2,2,2],[0,1,2],[2,1,0]]; let N = 400000, ret = 0, any = 0, prof = 0;
  for (let i = 0; i < N; i++) { const g = [0,1,2].map(() => [pick(), pick(), pick()]); const M = LINES.reduce((a, L) => a + slMult(L.map((r, j) => g[j][r])), 0);
    ret += M / 5; if (M > 0) any++; if (M > 5) prof++ }
  console.log(`5 lines (MC): return ${(ret / N * 100).toFixed(2)}% · something back ${(any / N * 100).toFixed(1)}% · profit ${(prof / N * 100).toFixed(1)}% of spins`);
  assert.ok(Math.abs(ret / N - rtp) < 0.01) }
