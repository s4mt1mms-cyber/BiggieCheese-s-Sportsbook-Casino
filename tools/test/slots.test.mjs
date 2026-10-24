// Slot machine return-to-player, computed exactly from the constants in public/index.html (owner: standard casino edge ≈ 5%).
import fs from "node:fs";
import assert from "node:assert/strict";
const html = fs.readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
const line = html.match(/const SL_SYM=.*?;\n/)[0];
const fn = html.match(/function slMult\(r\)\{[^\n]*?\n?[^\n]*?\}/)[0];
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
