// Biggietown live match server (owner Oct 28). Runs on Cloud Run as one instance holding every player's WebSocket.
// The server is the only thing that decides hits, kills and money:
//   - movement comes from the players (it's sanity-checked: speed, map bounds), shots are re-done here with lag compensation
//     against ONE hitbox shape for everyone (HB), whatever skin they wear, so nobody gets a smaller target;
//   - money: the player's page writes the buy-in (bank/<id> kind "wwbuy", from player to house, amt = the table's buy-in);
//     the server checks it, marks it used, and when the run ends writes ONE payout bank/wwout_<buyId> (house -> player, amt = the stack).
//     Each kill adds the killer's own buy-in to their stack (from the house); dying pays out half your stack (owner Oct 28).
// Protocol: JSON messages, see the comment above each handler. Map (walls, spawns) = map.json exported from the game (tools: server/README).
import http from "node:http";
import fs from "node:fs";
import net from "node:net";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();
const db = getFirestore(), auth = getAuth();
const MAP = JSON.parse(fs.readFileSync(new URL("./map.json", import.meta.url)));
const COLS = MAP.cols.map(([x0, x1, y0, y1, z0, z1]) => ({ x0, x1, y0, y1, z0, z1 }));
/* pushable wagons: [x, z, hx, hz] from map.json; positions relayed by whoever pushes them, they block bullets where they are now */
const WAGONS = (MAP.wagons || []).map(([x, z, hx, hz]) => ({ x, z, hx, hz, x0: x - hx, x1: x + hx, y0: 0, y1: 2.4, z0: z - hz, z1: z + hz }));
const OWNER = "s4mt1mms@gmail.com";
/* Free-for-all (owner Oct 28): a second copy of this file runs as a child process (MODE=ffa, port 8081) with its own town;
   the main server forwards /ffa WebSockets to it. Free to play, 5-minute matches, points for kills (more for headshots),
   the top scorer wins FFA_PRIZE BB from the house, only if 2+ players played in that match. */
const FFA = process.env.MODE === "ffa", FFA_PORT = 8081, FFA_MS = 5 * 60000, FFA_GAP = 10000, FFA_PRIZE = 1000, FFA_KILL = 100, FFA_HEAD = 150, FFA_RESPAWN = 3000;

/* ---- rules of the match ---- */
const BUY_MIN = 100, BUY_MAX = 10000;   /* owner Oct 28: any buy-in on a slider, everyone in one town */
const okBuy = a => Number.isInteger(a) && a >= BUY_MIN && a <= BUY_MAX;
const HOUSE_CUT = 0;            // share of each kill's BB that goes to the house (0 until the owner decides)
const HP = 100, BODY = 34, HEAD = 100, FAR = 40, FAR_BODY = 25;
const FIRE_MS = 230, MAG = 6, RELOAD_MS = 1600;
/* guns (owner Oct 28): rv = revolver, sn = sniper (5-round, slow bolt, 80 body / 150 head, no falloff) */
const MAGS = { rv: MAG, sn: 1 }, FIREMS = { rv: FIRE_MS, sn: 400 }, RLMS = { rv: RELOAD_MS, sn: 1900 }, SN_BODY = 100, SN_HEAD = 150; /* owner Oct 28: the sniper kills in one hit anywhere */
const gunOf = (w) => (w === "sn" ? "sn" : "rv");
const PROT_MS = 3000;          // spawn protection (ends early when you shoot)
const CASH_MS = 5000;          // stand at the bank this long to cash out
const COMBAT_MS = 10000;       // hit within this long = "in a fight": quitting counts as dying to whoever hit you last
const DC_MS = 10000;           // a dropped player's body stays this long (can still be shot), then cashes out
const TICK_MS = 50;            // 20 snapshots a second
const MAX_REWIND = 250;
/* one hitbox for everyone: a standing cylinder + a head sphere (metres, from the feet) */
const HB = { r: 0.42, y0: 0.05, y1: 1.5, hy: 1.68, hr: 0.25 };   /* owner Oct 28: a little bigger than the models (was r .38, head .22) */
const EYE = 1.62;
const BANK = { x0: -38.5, x1: -30.5, z0: -9.8, z1: -6.0 };
/* doors / glass / bell / the car (owner Oct 28) */
const doors = new Array(32).fill(false), glass = new Map(); let bellAt = 0;
const GLASS_BACK = 90000, CAR_HP = 500, /* owner Oct 28 (was 1,000) */ CAR_BOOM_R = 6, CAR_RESPAWN = 60000, CAR_SPAWN = [-30, -3, -Math.PI / 2], CAR_MAX = 22;
const car = { x: CAR_SPAWN[0], z: CAR_SPAWN[1], yaw: CAR_SPAWN[2], v: 0, hp: CAR_HP, alive: true, driver: null, deadAt: 0, lastHit: null, lastIn: 0 };
const carArr = () => [+car.x.toFixed(2), +car.z.toFixed(2), +car.yaw.toFixed(3), +car.v.toFixed(2), Math.max(0, Math.round(car.hp)), car.driver ? car.driver.n : 0, car.alive ? 1 : 0];
/* ray vs the car's box in car space (x ±1, y 0.2..2.6, z ±2.2) */
function carRay(o, d) {
  const s = Math.sin(-car.yaw), k = Math.cos(-car.yaw), ox = o.x - car.x, oz = o.z - car.z;
  return rayBox({ x: ox * k + oz * s, y: o.y, z: -ox * s + oz * k }, { x: d.x * k + d.z * s, y: d.y, z: -d.x * s + d.z * k }, { x0: -1, x1: 1, y0: .2, y1: 2.6, z0: -2.2, z1: 2.2 });
}
/* the driver can be shot (owner Oct 28): head + chest balls on the driver's seat, in car space */
function driverHit(o, d) {
  const s = Math.sin(-car.yaw), k = Math.cos(-car.yaw), ox = o.x - car.x, oz = o.z - car.z, lo = { x: ox * k + oz * s, y: o.y, z: -ox * s + oz * k }, ld = { x: d.x * k + d.z * s, y: d.y, z: -d.x * s + d.z * k };
  const th = raySphere(lo, ld, { x: 0, y: 2.45, z: .6 }, .27), tb = raySphere(lo, ld, { x: 0, y: 1.98, z: .6 }, .42);
  if (th != null && (tb == null || th <= tb + .05)) return { t: th, head: true }; if (tb != null) return { t: tb, head: false }; return null;
}
function carOut(p) { if (car.driver === p) { car.driver = null; car.v = 0; } if (p) p.inCar = false; }

/* ---- helpers ---- */
const now = () => Date.now();
const send = (ws, m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const inBank = p => p.x > BANK.x0 && p.x < BANK.x1 && p.z > BANK.z0 && p.z < BANK.z1;
function rayBox(o, d, c) {
  let t0 = 0, t1 = 1e9; const ax = [["x", c.x0, c.x1], ["y", c.y0, c.y1], ["z", c.z0, c.z1]];
  for (const [k, lo, hi] of ax) { const od = o[k], dd = d[k];
    if (Math.abs(dd) < 1e-9) { if (od < lo || od > hi) return null; continue; }
    let a = (lo - od) / dd, b = (hi - od) / dd; if (a > b) [a, b] = [b, a]; if (a > t0) t0 = a; if (b < t1) t1 = b; if (t0 > t1) return null; }
  return t0;
}
function wallT(o, d, max) { let best = max; for (const c of COLS) { const t = rayBox(o, d, c); if (t != null && t < best) best = t; } for (const c of WAGONS) { const t = rayBox(o, d, c); if (t != null && t < best) best = t; } return best; }
function raySphere(o, d, c, r) { const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z, b = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - r * r, h = b * b - cc; if (h < 0) return null; const t = -b - Math.sqrt(h); return t > 0 ? t : null; }
/* ray vs the standing cylinder of the hitbox */
function rayCyl(o, d, p) {
  const ox = o.x - p.x, oz = o.z - p.z, a = d.x * d.x + d.z * d.z; if (a < 1e-9) return null;
  const b = ox * d.x + oz * d.z, c = ox * ox + oz * oz - HB.r * HB.r, h = b * b - a * c; if (h < 0) return null;
  for (const t of [(-b - Math.sqrt(h)) / a, (-b + Math.sqrt(h)) / a]) { if (t <= 0) continue; const y = o.y + d.y * t; if (y >= p.y + HB.y0 && y <= p.y + (p.cr ? .95 : HB.y1)) return t; }
  return null;
}
function hitTest(o, d, p) {
  const th = raySphere(o, d, { x: p.x, y: p.y + (p.cr ? 1.1 : HB.hy), z: p.z }, HB.hr), tb = rayCyl(o, d, p); /* crouching: head at 1.1, body to 0.95 */
  if (th != null && (tb == null || th <= tb + 0.05)) return { t: th, head: true };
  if (tb != null) return { t: tb, head: false };
  return null;
}
function posAt(p, t) {
  const h = p.hist; if (!h.length) return { x: p.x, y: p.y, z: p.z };
  if (t >= h[h.length - 1][0]) { const l = h[h.length - 1]; return { x: l[1], y: l[2], z: l[3], cr: l[4] }; }
  for (let i = h.length - 1; i > 0; i--) { const a = h[i - 1], b = h[i]; if (t >= a[0]) { const k = (t - a[0]) / Math.max(1, b[0] - a[0]); return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, z: a[3] + (b[3] - a[3]) * k, cr: k < .5 ? a[4] : b[4] }; } }
  return { x: h[0][1], y: h[0][2], z: h[0][3], cr: h[0][4] };
}
function sees(a, b) {
  const o = { x: a.x, y: (a.y || 0) + EYE, z: a.z }, d = { x: b.x - a.x, y: ((b.y || 0) + EYE) - o.y, z: b.z - a.z }, L = Math.hypot(d.x, d.y, d.z); if (L < 1e-6) return true;
  d.x /= L; d.y /= L; d.z /= L; return wallT(o, d, L) >= L - 0.01;
}

/* ---- one shared town (p.tier = that player's own buy-in) ---- */
const ROOM = { players: new Map() }, rooms = new Map([[0, ROOM]]);
const byPid = new Map();   // pid -> player record (one run at a time per player)
let nextN = 1;

function pickSpawn(room, me) {
  const others = [...room.players.values()].filter(p => p !== me && p.alive);
  let best = null, bs = -1;
  MAP.spawns.forEach((sp, i) => {
    if (i === me.lastSpawn) return; const pt = { x: sp[0], y: 0, z: sp[1] };
    const dmin = others.length ? Math.min(...others.map(o => Math.hypot(o.x - pt.x, o.z - pt.z))) : 99;
    if (others.length && (dmin < 15 || others.some(o => sees(o, pt)))) return;
    const sc = dmin + Math.random() * 12; if (sc > bs) { bs = sc; best = i; }
  });
  if (best == null) { /* nothing perfect: the spot farthest from anyone */ let far = -1; MAP.spawns.forEach((sp, i) => { const dm = others.length ? Math.min(...others.map(o => Math.hypot(o.x - sp[0], o.z - sp[1]))) : 99; if (dm > far) { far = dm; best = i; } }); }
  me.lastSpawn = best; return MAP.spawns[best];
}

function info(p) { return { n: p.n, name: p.name, skin: p.skin, stack: p.stack }; }
function broadcast(room, m, except) { for (const p of room.players.values()) if (p !== except) send(p.ws, m); }

/* the run is over: write the payout once, take the player out of the room */
async function endRun(p, reason) {
  if (p.ended) return; p.ended = true;
  const room = ROOM; room.players.delete(p.pid); if (byPid.get(p.pid) === p) byPid.delete(p.pid); carOut(p);
  broadcast(room, { t: "rm", n: p.n });
  if (FFA) { send(p.ws, { t: "out", amt: 0, reason, kills: p.kills, buy: 0, ffa: true }); p.conn.player = null; return; }
  const amt = Math.max(0, Math.floor(p.stack));
  try {
    await db.doc("bank/wwout_" + p.buyId).create({ kind: "wwout", from: "house", to: p.pid, amt, at: now(), buy: p.buyId, tier: p.tier, kills: p.kills, reason,
      note: `BiggieTown ${reason === "cash" ? "cash out" : reason === "dead" ? "walked out" : "left"}`, wv: "srv." + now() });
  } catch (e) { if (!/already exists/i.test(String(e && e.message))) console.error("payout failed", p.pid, p.buyId, amt, e); }
  send(p.ws, { t: "out", amt, reason, kills: p.kills, buy: p.tier });
  p.conn.player = null;
}

function kill(v, k, head, how) {
  const room = ROOM; if (!v.alive) return; v.alive = false; v.hp = 0; carOut(v); if (k === v) k = null;
  if (FFA) {
    let pts = 0; if (k) { k.kills++; const live = M && now() >= M.start; if (live) { pts = head ? FFA_HEAD : FFA_KILL; const e = ffaRow(k); e.pts += pts; e.kills++; if (head) e.hs++; } }
    if (M && now() >= M.start) ffaRow(v).deaths++;
    broadcast(room, { t: "kill", k: k ? k.name : (how === "boom" ? "The car" : ""), v: v.name, kn: k ? k.n : 0, vn: v.n, hs: !!head, amt: 0, pts, how: how || "shot" });
    send(v.ws, { t: "dead", by: k ? k.name : null, took: 0, keep: 0, ffa: true, ms: FFA_RESPAWN });
    v.deadAt = now(); if (how !== "quit") setTimeout(() => ffaRespawn(v), 20000); return; /* the player taps Respawn after FFA_RESPAWN; 20 s backstop */
  }
  /* owner Oct 28 (2nd rule set): every kill adds YOUR OWN buy-in to your stack (paid by the house, not taken from the victim);
     when you die you walk out with half your stack. 1 kill = break even. */
  const gain = k && k !== v ? k.tier : 0; if (gain) { k.stack += gain; k.kills++; send(k.ws, { t: "stack", stack: k.stack }); }
  const take = Math.ceil(v.stack / 2); v.stack -= take;
  broadcast(room, { t: "kill", k: k ? k.name : (how === "boom" ? "The car" : how === "quit" ? "" : "The desert"), v: v.name, kn: k ? k.n : 0, vn: v.n, hs: !!head, amt: gain, how: how || "shot" });
  send(v.ws, { t: "dead", by: k ? k.name : null, took: take, keep: v.stack });
  setTimeout(() => endRun(v, "dead"), 1200);
}


/* ---- free-for-all matches ---- */
let M = null;
function ffaRow(p) { let e = M.rows.get(p.pid); if (!e) { e = { pid: p.pid, name: p.name, pts: 0, kills: 0, hs: 0, deaths: 0, at: now() }; M.rows.set(p.pid, e); } e.name = p.name; return e; }
function ffaStart(delay) { const t = now(); M = { id: t, start: t + (delay || 0), end: t + (delay || 0) + FFA_MS, rows: new Map() }; for (const p of ROOM.players.values()) ffaRow(p); }
function ffaBoard() { return [...M.rows.values()].sort((a, b) => b.pts - a.pts || b.hs - a.hs || a.at - b.at); }
function ffaInfo() { if (!M) return null; return { id: M.id, start: M.start, end: M.end, top: ffaBoard().map(e => [e.name, e.pts]) }; }
function ffaRespawn(p) {
  if (!FFA || p.ended || p.alive) return; carOut(p); const sp = pickSpawn(ROOM, p);
  Object.assign(p, { x: sp[0], y: 0, z: sp[1], yaw: sp[2], alive: true, hp: HP, prot: now() + PROT_MS, am: { rv: MAG, sn: MAGS.sn }, reloadUntil: 0, lastHitBy: null, lastHitAt: 0, hist: [[now(), sp[0], 0, sp[1]]] });
  send(p.ws, { t: "respawn", spawn: [p.x, p.y, p.z, p.yaw], prot: PROT_MS });
}
async function ffaFinish() {
  const m = M, board = ffaBoard(), w = board[0], players = m.rows.size, paid = !!(w && w.pts > 0 && players >= 2);
  if (paid) { try { await db.doc("bank/wwffa_" + m.id).create({ kind: "wwffa", from: "house", to: w.pid, amt: FFA_PRIZE, at: now(), pts: w.pts, players, note: "BiggieTown free-for-all win", wv: "srv." + now() }); }
    catch (e) { console.error("ffa prize", e); } }
  broadcast(ROOM, { t: "ffaend", board: board.map(e => [e.name, e.pts, e.kills, e.hs]), winner: w ? w.name : null, wpid: w ? w.pid : null, paid, prize: FFA_PRIZE, players, next: FFA_GAP });
  M = null; if (ROOM.players.size) { ffaStart(FFA_GAP); setTimeout(() => { for (const p of ROOM.players.values()) if (p.alive) { p.alive = false; ffaRespawn(p); } }, FFA_GAP); }
}

function carBoom(by) {
  if (!car.alive) return; car.alive = false; car.hp = 0; car.deadAt = now(); car.v = 0;
  broadcast(ROOM, { t: "boom", x: car.x, z: car.z });
  const k = by && !by.ended && by.alive ? by : null;
  for (const q of [...ROOM.players.values()]) { if (!q.alive) continue; if (q === car.driver || Math.hypot(q.x - car.x, q.z - car.z) < CAR_BOOM_R) kill(q, k, false, "boom"); }
  car.driver = null;
}
/* ---- connections ---- */
const srv = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url.startsWith("/status")) { res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ up: true, v: MAP.v, n: [...ROOM.players.values()].filter(p => !p.dc).length, min: BUY_MIN, max: BUY_MAX, ffa: ffaStat })); return; }
  res.end("BiggieTown server");
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 8192 });
/* /ffa WebSockets go to the free-for-all child process; everything else is this town */
srv.on("upgrade", (req, sock, head) => {
  if (!FFA && String(req.url || "").startsWith("/ffa")) {
    /* Oct 29: right after a cold start the free-for-all child isn't listening yet; keep trying for ~12 s instead of dropping the player (that showed as "servers down") */
    let tries = 0, gone = false; sock.on("error", () => { gone = true; }); sock.on("close", () => { gone = true; });
    const go = () => { if (gone) return; const up = net.connect(FFA_PORT, "127.0.0.1", () => { let h = `${req.method} ${req.url} HTTP/1.1\r\n`; for (let i = 0; i < req.rawHeaders.length; i += 2) h += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
        up.write(h + "\r\n"); if (head && head.length) up.write(head); sock.pipe(up); up.pipe(sock); sock.on("error", () => up.destroy()); sock.on("close", () => up.destroy()); });
      up.on("error", () => { if (up.remoteAddress) { sock.destroy(); return; } if (++tries < 24 && !gone) setTimeout(go, 500); else sock.destroy(); }); };
    go(); return;
  }
  wss.handleUpgrade(req, sock, head, ws => wss.emit("connection", ws, req));
});
let ffaStat = FFA ? null : { up: false, n: 0 };
if (!FFA) { let stopping = false; const start = () => { const ch = fork(fileURLToPath(import.meta.url), [], { env: { ...process.env, MODE: "ffa", PORT: String(FFA_PORT) } });
    ch.on("message", m => { if (m && m.t === "stat") ffaStat = { up: true, n: m.n, end: m.end, start: m.start }; });
    ch.on("exit", () => { ffaStat = { up: false, n: 0 }; if (!stopping) setTimeout(start, 3000); }); process.on("SIGTERM", () => { stopping = true; try { ch.kill("SIGTERM"); } catch (_) {} }); }; start(); }
else setInterval(() => { try { process.send && process.send({ t: "stat", n: ROOM.players.size, end: M ? M.end : 0, start: M ? M.start : 0 }); } catch (_) {} }, 3000);

async function allowed(email) {
  if (email === OWNER) return true;
  try { const c = (await db.doc("config/ww").get()).data() || {}; if (c.open === true) return true; } catch (_) {}
  try { const a = (await db.doc("config/admins").get()).data() || {}; return (a.emails || []).includes(email); } catch (_) { return false; }
}

wss.on("connection", ws => {
  const conn = { ws, pid: null, name: null, player: null, rtt: 120, off: 0 };
  ws.on("message", async raw => {
    let m; try { m = JSON.parse(raw); } catch (_) { return; }
    try { await handle(conn, m); } catch (e) { console.error("handle", m && m.t, e); }
  });
  ws.on("close", () => onClose(conn));
  ws.on("error", () => {});
});

async function handle(c, m) {
  const p = c.player;
  switch (m.t) {
    /* {t:"hello", tok} -> {t:"auth", ok, pid, name, active, tier} */
    case "hello": {
      let tok; try { tok = await auth.verifyIdToken(String(m.tok || "")); } catch (_) { return send(c.ws, { t: "auth", ok: false, why: "Sign-in expired. Reopen the app." }); }
      if (!(await allowed(tok.email))) return send(c.ws, { t: "auth", ok: false, why: "BiggieTown isn't open yet." });
      const ln = await db.doc("links/" + tok.uid).get(); const pid = ln.exists && ln.data().oldId; if (!pid) return send(c.ws, { t: "auth", ok: false, why: "Not a league member." });
      const pr = (await db.doc("prefs/" + pid).get()).data() || {}; const prof = (await db.doc("profiles/" + pid).get()).data() || {};
      c.pid = pid; c.admin = tok.email === OWNER || await (async () => { try { const a = (await db.doc("config/admins").get()).data() || {}; return (a.emails || []).includes(tok.email); } catch (_) { return false; } })();
      c.name = pr.team || prof.name || "Stranger"; c.skin = pr.skin && pr.skins && pr.skins[pr.skin] ? pr.skin : null;
      c.emotes = new Set(Object.keys(pr.emotes || {}).filter(k => pr.emotes[k]));
      const act = byPid.get(pid);
      return send(c.ws, { t: "auth", ok: true, pid, name: c.name, active: !!act, tier: act ? act.tier : null, min: BUY_MIN, max: BUY_MAX });
    }
    /* {t:"join", buy:<bank doc id> | null to resume} -> {t:"welcome", n, tier, stack, players, spawn} */
    case "join": {
      if (!c.pid) return;
      let P = byPid.get(c.pid);
      if (P) { /* resume (dropped connection or a second device): take over the same run */
        if (P.conn !== c) { try { if (P.conn && P.conn.ws !== c.ws) P.conn.ws.close(4000, "resumed"); } catch (_) {} }
        P.conn = c; P.ws = c.ws; P.dc = 0; c.player = P;
      } else if (FFA) {
        P = { conn: c, ws: c.ws, pid: c.pid, name: c.name, skin: c.skin, n: nextN++, tier: 0, buyId: null, stack: 0, kills: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
          hp: HP, alive: false, hist: [], ammo: MAG, am: { rv: MAG, sn: MAGS.sn }, wpn: "rv", lastShot: 0, reloadUntil: 0, prot: 0, lastHitBy: null, lastHitAt: 0, cash0: 0, dc: 0, lastIn: 0 };
        byPid.set(c.pid, P); c.player = P; P.emotes = c.emotes || new Set(); P.lastEmo = 0;
      } else {
        if (!c.admin) return send(c.ws, { t: "err", why: "The buy-in shootout is closed for now. Try Free for all." }); /* owner Oct 28 */
        const id = String(m.buy || ""); if (!/^wwin_[A-Za-z0-9_]+$/.test(id)) return send(c.ws, { t: "err", why: "No buy-in." });
        const ref = db.doc("bank/" + id); let tier = 0;
        try { await db.runTransaction(async tx => { const d = await tx.get(ref); const b = d.exists && d.data();
          if (!b || b.kind !== "wwbuy" || b.from !== c.pid || b.to !== "house" || b.used || !okBuy(b.amt) || now() - (b.at || 0) > 600000) throw new Error("bad buy-in");
          tier = b.amt; tx.update(ref, { used: true, usedAt: now() }); }); }
        catch (e) { return send(c.ws, { t: "err", why: "That buy-in couldn't be used." }); }
        P = { conn: c, ws: c.ws, pid: c.pid, name: c.name, skin: c.skin, n: nextN++, tier, buyId: id, stack: tier, kills: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0,
          hp: HP, alive: false, hist: [], ammo: MAG, am: { rv: MAG, sn: MAGS.sn }, wpn: "rv", lastShot: 0, reloadUntil: 0, prot: 0, lastHitBy: null, lastHitAt: 0, cash0: 0, dc: 0, lastIn: 0 };
        byPid.set(c.pid, P); c.player = P;
        P.emotes = c.emotes || new Set(); P.lastEmo = 0;
      }
      const room = ROOM;
      if (!room.players.has(P.pid)) { room.players.set(P.pid, P); broadcast(room, { t: "add", ...info(P) }, P); }
      if (FFA) { if (!M) ffaStart(0); ffaRow(P); }
      if (!P.alive) { const sp = pickSpawn(room, P); Object.assign(P, { x: sp[0], y: 0, z: sp[1], yaw: sp[2], alive: true, hp: HP, prot: now() + PROT_MS, ammo: MAG, am: { rv: MAG, sn: MAGS.sn }, reloadUntil: 0, hist: [[now(), sp[0], 0, sp[1]]] }); }
      return send(c.ws, { t: "welcome", n: P.n, tier: P.tier, stack: P.stack, kills: P.kills, hp: P.hp, spawn: [P.x, P.y, P.z, P.yaw], prot: Math.max(0, P.prot - now()),
        players: [...room.players.values()].filter(q => q !== P).map(info), bank: BANK, doors, wagons: WAGONS.map(w => [w.x, w.z]), glass: [...glass].map(([i, g]) => [i, g.s, g.u, g.v]), car: carArr(), ffa: FFA ? ffaInfo() : null, rules: { cut: HOUSE_CUT, body: BODY, head: HEAD, prot: PROT_MS, cash: CASH_MS } });
    }
    /* {t:"emo", id}: play an emote you own (from the shop); everyone in the match sees it. 8 s cooldown */
    case "emo": {
      if (!p || !p.alive) return; const id = String(m.id || ""), t = now(); if (!(p.emotes && p.emotes.has(id)) || t - p.lastEmo < 8000) return;
      p.lastEmo = t; broadcast(ROOM, { t: "emo", n: p.n, id }); return;
    }
    /* doors: {t:"door", i, open} — everyone sees it */
    case "wagon": { if (!p || !p.alive) return; const w = WAGONS[m.i | 0], x = +m.x, z = +m.z; if (!w || !Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x - w.x, z - w.z) > 3 || Math.hypot(x - p.x, z - p.z) > 6) return;
      Object.assign(w, { x, z, x0: x - w.hx, x1: x + w.hx, z0: z - w.hz, z1: z + w.hz }); broadcast(ROOM, { t: "wagon", i: m.i | 0, x, z }, p); return; }
    case "door": { if (!p) return; const i = m.i | 0; if (i < 0 || i >= doors.length) return; doors[i] = !!m.open; broadcast(ROOM, { t: "door", i, open: doors[i] }, p); return; }
    /* a window shot out: {t:"glass", i}; it comes back after 90 s */
    case "glass": { if (!p) return; const i = m.i | 0, st = m.s === 1 ? 1 : 2; if (i < 0 || i > 999) return; const g = glass.get(i); if (g && g.s >= st) return;
      const e = { s: st, u: +m.u || .5, v: +m.v || .5, at: g ? g.at : now() }; glass.set(i, e); broadcast(ROOM, { t: "glass", i, s: st, u: e.u, v: e.v }, p); return; }
    /* the church bell: loud for everyone, 3 s cooldown */
    case "bell": { if (!p || now() - bellAt < 3000) return; bellAt = now(); broadcast(ROOM, { t: "bell" }); return; }
    /* get in / out of the car: {t:"car", on} */
    case "car": {
      if (!p || !p.alive) return;
      if (m.on) { if (!car.alive || car.driver || Math.hypot(p.x - car.x, p.z - car.z) > 4) return send(c.ws, { t: "car", on: false, why: car.driver ? "Someone's driving it" : "Too far from the car" });
        car.driver = p; p.inCar = true; p.prot = 0; car.lastIn = now(); return send(c.ws, { t: "car", on: true }); }
      if (car.driver === p) { carOut(p); p.x = car.x + Math.cos(car.yaw) * 1.9; p.z = car.z - Math.sin(car.yaw) * 1.9; p.y = 0; p.hist.push([now(), p.x, p.y, p.z]); send(c.ws, { t: "car", on: false }); }
      return;
    }
    /* driving: {t:"cin", x, z, yaw, v} ~20/s from the driver; run-overs are decided here */
    case "cin": {
      if (!p || car.driver !== p || !car.alive) return; const t = now(), dt = Math.max(.03, Math.min(1, (t - (car.lastIn || t - 50)) / 1000)); car.lastIn = t;
      const x = +m.x, z = +m.z; if (![x, z, +m.yaw].every(Number.isFinite)) return; const B = MAP.bounds;
      if (Math.hypot(x - car.x, z - car.z) > CAR_MAX * dt + 1 || x < B.x0 - 1 || x > B.x1 + 1 || z < B.z0 - 1 || z > B.z1 + 1) return;
      car.x = x; car.z = z; car.yaw = +m.yaw; car.v = Math.max(-8, Math.min(CAR_MAX, +m.v || 0)); p.x = x; p.z = z; p.y = 0; p.hist.push([t, x, 0, z]); while (p.hist.length && t - p.hist[0][0] > 1000) p.hist.shift();
      if (Math.abs(car.v) > 4) { const s = Math.sin(-car.yaw), k = Math.cos(-car.yaw);
        for (const q of [...ROOM.players.values()]) { if (q === p || !q.alive || q.inCar || q.prot > t) continue; const ox = q.x - car.x, oz = q.z - car.z, lx = ox * k + oz * s, lz = -ox * s + oz * k;
          if (Math.abs(lx) < 1.35 && Math.abs(lz) < 2.6) { /* damage grows with speed (owner Oct 28): ~36 at 7 m/s, 100 (a kill) from ~14 m/s */
            if (t - (q.carHitAt || 0) < 700) continue; q.carHitAt = t; const dmg = Math.round(Math.min(150, (Math.abs(car.v) - 3) * 9)); q.hp = Math.max(0, q.hp - dmg); q.lastHitBy = p; q.lastHitAt = t;
            send(q.ws, { t: "hit", by: p.n, dmg, hp: q.hp, hs: false, from: [car.x, car.z] }); send(c.ws, { t: "hc", on: q.n, kill: q.hp <= 0 }); if (q.hp <= 0) kill(q, p, false, "car"); } } }
      return;
    }
    case "ping": { send(c.ws, { t: "pong", c: m.c, s: now() }); if (m.rtt > 0) c.rtt = Math.min(1000, m.rtt); return; }
    /* {t:"in", x,y,z,yaw,pitch} ~20/s: the player's own movement, checked for speed and bounds */
    case "in": {
      if (!p || !p.alive || p.inCar) return; const t = now(), dt = Math.max(0.03, Math.min(1, (t - (p.lastIn || t - 50)) / 1000)); p.lastIn = t;
      const x = +m.x, y = +m.y, z = +m.z; if (![x, y, z].every(Number.isFinite)) return;
      const B = MAP.bounds, dh = Math.hypot(x - p.x, z - p.z), dv = Math.abs(y - p.y);
      /* speed check as a budget (perf/lag, Oct 28): unused allowance carries over ~0.25 s, so packets that arrive bunched after a hiccup
         aren't mistaken for speeding (that snapped laggy players back). The top speed allowed over time is unchanged. */
      p.mb = Math.min(2.6, (p.mb == null ? 1 : p.mb) + 10.5 * dt);
      if (dh > p.mb + 0.6 || dv > 12 * dt + 1.2 || x < B.x0 - 1 || x > B.x1 + 1 || z < B.z0 - 1 || z > B.z1 + 1 || y < -0.5 || y > 12) { send(c.ws, { t: "pos", x: p.x, y: p.y, z: p.z }); return; }
      p.mb = Math.max(0, p.mb - dh); p.x = x; p.y = y; p.z = z; p.yaw = +m.yaw || 0; p.pitch = Math.max(-1.6, Math.min(1.6, +m.pitch || 0)); p.moving = dh / dt; p.cr = m.cr ? 1 : 0;
      p.hist.push([t, x, y, z, p.cr]); while (p.hist.length && t - p.hist[0][0] > 1000) p.hist.shift();
      if (p.cash0 && !inBank(p)) { p.cash0 = 0; send(c.ws, { t: "cash", on: false }); }
      return;
    }
    case "respawn": { if (FFA && p && !p.alive && now() - (p.deadAt || 0) >= FFA_RESPAWN - 250) ffaRespawn(p); return; }
    case "wpn": { if (!p || !p.alive) return; p.wpn = gunOf(m.w); p.reloadUntil = 0; return; }
    case "rl": { if (!p || !p.alive) return; const w = gunOf(m.w); if (p.am[w] < MAGS[w] && !p.reloadUntil) { p.reloadUntil = now() + RLMS[w]; p.reloadW = w; } return; }
    /* {t:"shot", d:[dx,dy,dz]}: fired from the server's idea of your eyes; others are rewound to what you saw */
    case "shot": {
      if (!p || !p.alive) return; const t = now();
      const w = gunOf(m.w); p.wpn = w;
      if (p.reloadUntil) { if (t < p.reloadUntil) return; p.reloadUntil = 0; p.am[p.reloadW || "rv"] = MAGS[p.reloadW || "rv"]; }
      if (t - p.lastShot < FIREMS[w] - 30 || p.am[w] <= 0) return; p.lastShot = t; p.am[w]--; p.prot = 0;
      let d = Array.isArray(m.d) ? { x: +m.d[0], y: +m.d[1], z: +m.d[2] } : null; if (!d || ![d.x, d.y, d.z].every(Number.isFinite)) return;
      const L = Math.hypot(d.x, d.y, d.z); if (L < 0.5) return; d.x /= L; d.y /= L; d.z /= L;
      const o = { x: p.x, y: p.y + (p.cr ? EYE - .57 : EYE), z: p.z }, room = ROOM, rw = t - Math.min(MAX_REWIND, c.rtt / 2 + 100);
      let best = wallT(o, d, 120), hit = null, carHit = false;
      const wb = best; if (car.alive && car.driver !== p) { const tc = carRay(o, d); if (tc != null && tc < best) { best = tc; carHit = true; } }
      { const dv = car.driver; if (dv && dv !== p && dv.alive && car.alive) { const hd = driverHit(o, d); if (hd && hd.t < wb) { best = hd.t; hit = { q: dv, head: hd.head }; carHit = false; } } }
      for (const q of room.players.values()) { if (q === p || !q.alive || q.inCar) continue; const at = posAt(q, rw), h = hitTest(o, d, at); if (h && h.t < best) { best = h.t; hit = { q, head: h.head }; carHit = false; } }
      broadcast(room, { t: "fx", n: p.n, e: [o.x + d.x * best, o.y + d.y * best, o.z + d.z * best] }, p);
      if (carHit) { car.hp -= w === "sn" ? SN_BODY : best > FAR ? FAR_BODY : BODY; car.lastHit = p; send(c.ws, { t: "hc", car: true }); if (car.hp <= 0) carBoom(p); return; }
      if (!hit) return;
      const q = hit.q; if (q.prot > t) { send(c.ws, { t: "hc", on: q.n, prot: true }); return; }
      const dmg = w === "sn" ? (hit.head ? SN_HEAD : SN_BODY) : hit.head ? HEAD : best > FAR ? FAR_BODY : BODY; q.hp = Math.max(0, q.hp - dmg); q.lastHitBy = p; q.lastHitAt = t;
      if (q.cash0) { q.cash0 = 0; send(q.ws, { t: "cash", on: false, why: "hit" }); }
      send(q.ws, { t: "hit", by: p.n, dmg, hp: q.hp, hs: hit.head, from: [p.x, p.z] });
      send(c.ws, { t: "hc", on: q.n, hs: hit.head, kill: q.hp <= 0 });
      if (q.hp <= 0) kill(q, p, hit.head);
      return;
    }
    /* {t:"cash", on}: hold still-ish at the bank for CASH_MS (taking a hit cancels it) */
    case "cash": { return; /* owner Oct 28: no cashing out, the run ends when you die */
      if (!p || !p.alive) return; if (!m.on) { p.cash0 = 0; return send(c.ws, { t: "cash", on: false }); }
      if (!inBank(p) || p.inCar) return send(c.ws, { t: "cash", on: false, why: "bank" });
      p.cash0 = now(); return send(c.ws, { t: "cash", on: true, ms: CASH_MS });
    }
  }
}

function onClose(c) {
  const p = c.player; if (!p || p.ended || p.conn !== c) return;
  if (FFA) { p.alive = false; endRun(p, "quit"); return; }
  if (now() - p.lastHitAt < COMBAT_MS && p.lastHitBy && p.alive) { kill(p, p.lastHitBy.ended ? null : p.lastHitBy, false, "quit"); return; }  /* quitting mid-fight = dying */
  p.dc = now();   /* the body stays (and can be shot) for DC_MS, then the run cashes out */
}

/* ---- the tick: snapshots, cash-outs, dropped players, reloads, healing ---- */
let ffaSentAt = 0;
setInterval(() => {
  const t = now();
  if (FFA && M && t >= M.end && !M.done) { M.done = true; ffaFinish(); }
  if (FFA && M && !ROOM.players.size && t > M.start + 1000) M = null; /* empty town: the next player starts a fresh match */
  const fi = FFA && M && t - ffaSentAt > 1000 ? (ffaSentAt = t, ffaInfo()) : null;
  for (const [i, g] of glass) if (t - g.at > GLASS_BACK) { glass.delete(i); broadcast(ROOM, { t: "glassfix", i }); }
  if (!car.alive && t - car.deadAt > CAR_RESPAWN) Object.assign(car, { x: CAR_SPAWN[0], z: CAR_SPAWN[1], yaw: CAR_SPAWN[2], v: 0, hp: CAR_HP, alive: true, driver: null, lastHit: null });
  if (car.driver && (car.driver.ended || !car.driver.alive || (car.driver.dc && t - car.driver.dc > 1000))) carOut(car.driver);
  for (const room of rooms.values()) {
    if (!room.players.size) continue;
    for (const p of [...room.players.values()]) {
      if (p.ended) continue;
      if (p.dc && t - p.dc > DC_MS && p.alive) { const k = p.lastHitBy && !p.lastHitBy.ended && p.lastHitBy.alive && t - p.lastHitAt < 60000 ? p.lastHitBy : null; kill(p, k, false, "quit"); continue; }
      if (p.reloadUntil && t >= p.reloadUntil) { p.reloadUntil = 0; p.am[p.reloadW || "rv"] = MAGS[p.reloadW || "rv"]; }

      /* slow heal after 6 s without being hit */
      if (p.alive && p.hp < HP && t - p.lastHitAt > 7000) p.hp = Math.min(HP, p.hp + 0.3); /* owner Oct 28: after 7 s, ~6 HP/s */
    }
    const list = [...room.players.values()].filter(p => p.alive).map(p => [p.n, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(3), +p.pitch.toFixed(3),
      (p.prot > t ? 1 : 0) | (p.cash0 ? 2 : 0) | (p.dc ? 4 : 0) | (p.reloadUntil ? 8 : 0) | (p.inCar ? 16 : 0) | (p.cr ? 32 : 0), p.stack, Math.ceil(p.hp)]);
    const live = list.length;
    const ca = carArr();
    for (const p of room.players.values()) send(p.ws, { t: "s", ts: t, p: list, live, car: ca, ...(fi ? { ffa: fi, pts: (M.rows.get(p.pid) || {}).pts || 0 } : {}), hp: Math.floor(p.hp), ammo: p.reloadUntil ? -1 : p.am[p.wpn], aw: p.wpn, cash: p.cash0 ? Math.min(1, (t - p.cash0) / CASH_MS) : 0 });
  }
}, TICK_MS);

/* buy-ins nobody joined with (the connection dropped right after paying): refund after 3 minutes */
if (!FFA) setInterval(async () => {
  try {
    const qs = await db.collection("bank").where("kind", "==", "wwbuy").where("used", "==", false).get();
    for (const d of qs.docs) { const b = d.data(); if (now() - (b.at || 0) < 180000) continue;
      await db.runTransaction(async tx => { const x = await tx.get(d.ref); if (!x.exists || x.data().used) return; tx.update(d.ref, { used: true, usedAt: now(), refunded: true });
        tx.create(db.doc("bank/wwout_" + d.id), { kind: "wwout", from: "house", to: b.from, amt: Math.floor(b.amt) || 0, at: now(), buy: d.id, refund: true, note: "BiggieTown buy-in refunded", wv: "srv." + now() }); }).catch(() => {});
    }
  } catch (e) { console.error("refund sweep", e); }
}, 60000);

/* Cloud Run stops the instance with SIGTERM: everyone in a match cashes out first */
process.on("SIGTERM", async () => {
  const all = [...byPid.values()]; await Promise.all(all.map(p => endRun(p, "left").catch(() => {})));
  setTimeout(() => process.exit(0), 500);
});

srv.listen(process.env.PORT || 8080, () => console.log("biggietown up", MAP.cols.length, "walls"));
