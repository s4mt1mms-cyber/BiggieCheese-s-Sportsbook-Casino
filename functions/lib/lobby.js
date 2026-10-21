// Lobby helpers shared by both live tables (mirror rlSeats/thSeats/rlHost/thHost in public/index.html).
export const SEATBOT = [
  { n: "Cleo the Cat", k: "cat" },
  { n: "Bruno the Bear", k: "bear" },
  { n: "Whiskers the Rat", k: "rat" },
  { n: "Vixen the Fox", k: "fox" },
];
export const ANIMAL_G = { cat: 0, bear: 1, rat: 2, fox: 3 };
const STALE_SEAT = 10 * 60000;

/** Seats that still count (a chair from someone who wandered off 10+ minutes ago is open again). */
export function liveSeats(T, ctx, me) {
  const ss = (T && T.seats) || {};
  return [0, 1, 2, 3].map((g) => {
    const x = ss["s" + g];
    if (!x || !x.uid) return null;
    const lk = ctx.looks[x.uid];
    const live = T.state === "play" || x.uid === me || ctx.now - Math.max(x.at || 0, (lk && lk.at) || 0) < STALE_SEAT;
    return live ? { ...x, k: SEATBOT[g].k } : null;
  });
}
/** Who runs the lobby (sets buy-in, No bots, presses Start): the recorded host if still seated, else the first seat. */
export function leader(T, ctx, me) {
  const ss = liveSeats(T, ctx, me);
  if (T.host && ss.some((x) => x && x.uid === T.host)) return T.host;
  const f = ss.find(Boolean);
  return f ? f.uid : null;
}
/** Seated players whose page hasn't been seen for 25s don't get dealt in (the app's Start did the same).
 *  x = their seat: sitting down (stamped by the server) counts as being seen. */
export const idle = (ctx, x, me) => x.uid !== me && ctx.now - Math.max((ctx.looks[x.uid] || {}).at || 0, x.at || 0) > 25000;

export const cleanName = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) || "Player";
export const num = (v) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? x : 0; };
