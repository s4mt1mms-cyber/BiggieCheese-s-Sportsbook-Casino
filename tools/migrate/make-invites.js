#!/usr/bin/env node
/*
 * Make one invite code per existing team, after the import.
 *
 * Reads every prefs/{playerId} doc in Firestore (so it picks up whoever exists
 * at migration time), skips players who are already linked to a sign-in or who
 * already have an unused code, creates invites/{CODE} = {oldId: playerId, ...}
 * and prints team -> code -> link. Send each friend their link.
 *
 *   node make-invites.js --dry-run     # show what it would do
 *   node make-invites.js               # create the codes
 *   node make-invites.js --csv         # also save invites-<date>.csv (git-ignored)
 * Options:
 *   --project <id>   (default .firebaserc)   --key <service-account.json>
 *   --site <url>     link base (default https://<project>.web.app)
 *   --again          also make a fresh code for players who already have an unused one
 *   --include-linked also make codes for players already linked (e.g. a new phone/account)
 *
 * The owner's own team doesn't need a code: s4mt1mms@gmail.com is linked to
 * u_IfmXeDmDg1B3W4naCzVbSA automatically on first sign-in.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HERE, parseArgs, openFirestore } from "./lib.js";

const BOOTSTRAP_OLD_ID = "u_IfmXeDmDg1B3W4naCzVbSA";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // same as the Admin tab: no 0/O, 1/I/L
const newCode = (len = 8) => Array.from(crypto.randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join("");

const args = parseArgs(process.argv.slice(2));
const { db, project } = await openFirestore(args);
const site = String(args.site || `https://${project}.web.app`).replace(/\/$/, "");

const [prefs, invites, links] = await Promise.all([
  db.collection("prefs").get(), db.collection("invites").get(), db.collection("links").get(),
]);
const linked = new Map();
links.forEach((d) => { const o = d.get("oldId"); if (o) (linked.get(o) || linked.set(o, []).get(o)).push(d.get("email")); });
const openInv = new Map();
invites.forEach((d) => { const x = d.data(); if (x.oldId && !x.used && !x.revoked) openInv.set(x.oldId, d.id); });

const rows = [];
const batch = db.batch();
let made = 0;
for (const d of prefs.docs.sort((a, b) => String(a.get("team") || "").localeCompare(String(b.get("team") || "")))) {
  const id = d.id, team = String(d.get("team") || "(no team yet)");
  if (id === BOOTSTRAP_OLD_ID) { rows.push({ team, playerId: id, code: "-", link: "owner: links automatically on first sign-in" }); continue; }
  if (linked.has(id) && !args["include-linked"]) { rows.push({ team, playerId: id, code: "-", link: "already signed in (" + linked.get(id).length + " account)" }); continue; }
  if (openInv.has(id) && !args.again) { const c = openInv.get(id); rows.push({ team, playerId: id, code: c, link: `${site}/?invite=${c}  (existing)` }); continue; }
  let code;
  do { code = newCode(); } while (invites.docs.some((x) => x.id === code));
  rows.push({ team, playerId: id, code, link: `${site}/?invite=${code}` });
  if (!args["dry-run"]) {
    batch.set(db.doc("invites/" + code), {
      oldId: id, team, createdAt: Date.now(), createdBy: "make-invites.js", used: false, revoked: false,
    });
    made++;
  }
}
if (made) await batch.commit();
console.table(rows);
console.log(args["dry-run"] ? "Dry run: no codes created." : `Created ${made} new code(s).`);

if (args.csv) {
  const f = path.join(HERE, `invites-${new Date().toISOString().slice(0, 10)}.csv`);
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  fs.writeFileSync(f, ["team,playerId,code,link", ...rows.map((r) => [r.team, r.playerId, r.code, r.link].map(q).join(","))].join("\n") + "\n");
  console.log("Saved " + f);
}
