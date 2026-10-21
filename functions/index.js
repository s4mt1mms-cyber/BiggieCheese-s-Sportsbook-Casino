// BiggieCheese's Sportsbook game server: runs the live Russian Roulette and Texas Hold'em tables so no
// player's phone has to "host". See README "Live tables on the server".
//
// Every change to a table happens in one Firestore transaction on its table doc (rrtable/live, thtable/live)
// plus the private mpsecret/{rr|th} doc (deck + hole cards), driven by:
//   mpreq/{playerId}   lobby requests: join / leave / start / nobots / buyin / mode / stake  (answer: T.rsp[playerId])
//   thin/{playerId}    Hold'em moves (the same docs the phone host read)
//   rrin/{playerId}    Russian Roulette moves
//   mptick/{playerId}  "a deadline on the table has passed" pokes from any page at the table
//   mpSweep            every minute: catch up any overdue table, and prove the pipeline works (config/mp.beat)
// Deadlines are re-checked inside the transaction, so pokes are idempotent and can't hurry anything along.
// Short waits (a bot thinking, the deal animation) are slept through by the invocation that set them.
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions, logger } from "firebase-functions/v2";
import { encode, decode } from "./lib/codec.js";
import * as rng from "./lib/rng.js";
import { thRequest, thInput, thAdvance, thSeal, thUids } from "./lib/th.js";
import { rrRequest, rrInput, rrAdvance, rrUids } from "./lib/rr.js";

initializeApp();
const db = getFirestore();
// The region must be one Cloud Firestore triggers support for this project's database location (nam5 -> us-central1).
setGlobalOptions({ region: "us-central1", memory: "256MiB", timeoutSeconds: 120, maxInstances: 10 });

const CHAIN_WAIT = 8000;   // sleep through waits up to this long...
const CHAIN_BUDGET = 90000; // ...for at most this long per invocation (timeoutSeconds is 120)

const TABLES = {
  th: {
    doc: "thtable/live", uids: thUids, seal: thSeal,
    request: (T, sec, uid, q, ctx) => thRequest(T, sec, uid, q, ctx),
    input: (T, sec, uid, x, ctx) => thInput(T, sec, uid, x, ctx),
    advance: (T, sec, ctx) => thAdvance(T, sec, ctx),
  },
  rr: {
    doc: "rrtable/live", uids: rrUids, seal: () => {},
    request: (T, sec, uid, q, ctx) => rrRequest(T, uid, q, ctx),
    input: (T, sec, uid, x, ctx) => rrInput(T, uid, x, ctx),
    advance: (T, sec, ctx) => rrAdvance(T, ctx),
  },
};

/** One transaction: apply a request / input (if any), run the table as far as it goes, write it back. */
export async function step(tb, job) {
  const C = TABLES[tb];
  const tRef = db.doc(C.doc), sRef = db.doc("mpsecret/" + tb);
  return db.runTransaction(async (tx) => {
    const [ts, ss] = await tx.getAll(tRef, sRef);
    const T = ts.exists ? decode(ts.data()) : {};
    const sec = ss.exists ? decode(ss.data()) : {};
    const uids = new Set(C.uids(T));
    if (job.uid) uids.add(job.uid);
    const looks = {};
    if (uids.size) (await tx.getAll(...[...uids].map((u) => db.doc("rrlook/" + u)))).forEach((s) => { if (s.exists) looks[s.id] = decode(s.data()); });
    const now = Date.now();
    const ctx = { now, looks, rnd: rng.rnd, randN: rng.randN, deck: rng.deck, holes: [], chat: [] };
    const t0 = JSON.stringify(T), s0 = JSON.stringify(sec);
    const x = job.data || null;
    if (job.kind === "req" && x) {
      const n = Number(x.n) || 0, prev = ((T.rsp || {})[job.uid] || {}).n || 0;
      if (x.tb === tb && n > prev) {
        let r;
        try { r = C.request(T, sec, job.uid, x, ctx) || { ok: false }; } catch (e) { logger.error("request failed", tb, x.a, e); r = { ok: false, msg: "The table hit a snag. Try again." }; }
        T.rsp = Object.assign({}, T.rsp || {}, { [job.uid]: { n, ok: !!r.ok, msg: r.msg || null, at: now } });
      }
    } else if (job.kind === "in" && x && T.srv && T.sv) {
      const n = Number(x.n) || 0;
      T.sv.inSeen = T.sv.inSeen || {};
      if (n > (T.sv.inSeen[job.uid] || 0)) { T.sv.inSeen[job.uid] = n; C.input(T, sec, job.uid, x, ctx); }
    }
    if (T.srv) { C.advance(T, sec, ctx); C.seal(T); }
    const changed = JSON.stringify(T) !== t0;
    const live = T.state === "play" && T.srv && T.sv && T.sv.gid === T.gid;
    if (changed || (live && now - (T.at || 0) > 60000)) { T.at = now; tx.set(tRef, encode(T)); }
    if (JSON.stringify(sec) !== s0) tx.set(sRef, encode(sec));
    for (const h of ctx.holes) tx.set(db.doc("thhole/" + h.id), encode(h.data));
    for (const c of ctx.chat) tx.create(db.collection("chat").doc(), encode(c));
    return { changed, dl: live ? T.sv.dl || 0 : 0 };
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Run a job, then keep the table moving through short waits (bots thinking, deal/board pauses). */
async function drive(tb, job, chain = true) {
  const t0 = Date.now();
  // moves and pokes only matter to a game the server is running; never touch a phone-hosted table
  if (job.kind !== "req") {
    const s = await db.doc(TABLES[tb].doc).get();
    const d = s.exists ? s.data() : null;
    if (!d || d.srv !== true || d.state !== "play") return;
  }
  let r = await step(tb, job);
  beat().catch(() => {});
  while (chain && r.changed && r.dl > 0) {
    const wait = r.dl - Date.now();
    if (wait > CHAIN_WAIT || Date.now() - t0 + wait > CHAIN_BUDGET) break;
    await sleep(Math.max(0, wait) + 40);
    r = await step(tb, { kind: "tick" });
  }
}

// config/mp.beat says "the server is answering": the app only uses server tables while it's fresh,
// and the rules only lock phones out of the table docs while it's fresh.
let lastBeat = 0;
async function beat(force) {
  const now = Date.now();
  if (!force && now - lastBeat < 60000) return;
  lastBeat = now;
  await db.doc("config/mp").set({ beat: now }, { merge: true });
}

const safely = (fn) => async (ev) => { try { await fn(ev); } catch (e) { logger.error(e); } };
const payload = (ev) => { const a = ev.data && ev.data.after; return a && a.exists ? a.data() : null; };

export const mpRequest = onDocumentWritten("mpreq/{uid}", safely(async (ev) => {
  const d = payload(ev), uid = ev.params.uid;
  if (!d) return;
  if (uid === "_probe") return beat(true);
  if (!TABLES[d.tb]) return;
  await drive(d.tb, { kind: "req", uid, data: decode(d) });
}));

export const mpTick = onDocumentWritten("mptick/{uid}", safely(async (ev) => {
  const d = payload(ev);
  if (!d || !TABLES[d.tb]) return;
  await drive(d.tb, { kind: "tick" });
}));

export const thMove = onDocumentWritten("thin/{uid}", safely(async (ev) => {
  const d = payload(ev);
  if (!d) return;
  await drive("th", { kind: "in", uid: ev.params.uid, data: decode(d) });
}));

export const rrMove = onDocumentWritten("rrin/{uid}", safely(async (ev) => {
  const d = payload(ev);
  if (!d) return;
  await drive("rr", { kind: "in", uid: ev.params.uid, data: decode(d) });
}));

export const mpSweep = onSchedule({ schedule: "every 1 minutes", timeoutSeconds: 60 }, async () => {
  // end-to-end liveness: this write must come back through the mpRequest trigger to refresh config/mp.beat
  await db.doc("mpreq/_probe").set({ a: "probe", n: Date.now() }).catch((e) => logger.error("probe", e));
  for (const tb of Object.keys(TABLES)) await drive(tb, { kind: "tick" }, false).catch((e) => logger.error("sweep", tb, e));
});
