// Crypto-backed randomness for the game server (decks, chamber rolls, bot choices).
import { randomBytes, randomInt } from "node:crypto";

let buf = Buffer.alloc(0), off = 0;
/** Uniform float in [0, 1) from 48 random bits. */
export function rnd() {
  if (off + 6 > buf.length) { buf = randomBytes(6 * 1024); off = 0; }
  const v = buf.readUIntBE(off, 6); off += 6;
  return v / 2 ** 48;
}
/** Uniform integer in [0, n). */
export const randN = (n) => (n > 1 ? randomInt(n) : 0);
/** Fisher-Yates shuffled deck 0..n-1. */
export function deck(n = 52) {
  const d = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
