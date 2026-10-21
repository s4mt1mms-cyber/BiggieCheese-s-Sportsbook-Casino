#!/usr/bin/env node
/*
 * Import a JSON export of the old artifact database into Firestore.
 *
 * Export layout (what our existing export scripts produce):
 *   export/
 *     prefs/u_abc123.json      -> Firestore doc prefs/u_abc123
 *     bets/0w3jshpuvaua1qk2.json
 *     meta/league.json
 *     ...
 * Each file is either the raw document body, or wrapped as {"data": {...}}
 * (optionally with id/path/exists next to it). Document ids are kept exactly.
 *
 * Usage (from tools/migrate):
 *   npm install
 *   node import.js --list-users                 # who's in the export
 *   node import.js --dry-run                    # check everything, write nothing
 *   node import.js                              # write it
 * Options:
 *   --dir <path>       export folder (default: ./export)
 *   --project <id>     Firebase project (default: .firebaserc)
 *   --key <file>       service-account JSON (default: GOOGLE_APPLICATION_CREDENTIALS / gcloud login)
 *   --only a,b         only these collections
 *   --skip a,b         skip these collections
 *   --dry-run          read and validate, don't write
 * Set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 to import into the local emulator instead.
 *
 * Writes are full-document sets (same as the artifact's set()), so re-running
 * is safe: it just overwrites with the export again.
 */
import fs from "node:fs";
import path from "node:path";
import { encode } from "../../public/js/codec.js";
import { HERE, parseArgs, openFirestore } from "./lib.js";

const args = parseArgs(process.argv.slice(2));
const dir = path.resolve(args.dir || path.join(HERE, "export"));
const only = args.only ? new Set(String(args.only).split(",")) : null;
const skip = new Set(args.skip ? String(args.skip).split(",") : []);
const MAX_DOC_BYTES = 1_000_000; // Firestore limit is 1 MiB per document

const WRAP_KEYS = new Set(["data", "id", "path", "exists", "metadata", "createdAt", "updatedAt", "version"]);
function unwrap(j) {
  if (j && typeof j === "object" && !Array.isArray(j) && j.data && typeof j.data === "object" && !Array.isArray(j.data)
      && Object.keys(j).every((k) => WRAP_KEYS.has(k))) {
    if (j.exists === false) return null;
    return j.data;
  }
  return j;
}

function readExport() {
  if (!fs.existsSync(dir)) throw new Error(`Export folder not found: ${dir}`);
  const out = []; // {coll, id, data, bytes}
  for (const coll of fs.readdirSync(dir).sort()) {
    const cdir = path.join(dir, coll);
    if (!fs.statSync(cdir).isDirectory() || coll.startsWith(".")) continue;
    if (only && !only.has(coll)) continue;
    if (skip.has(coll)) continue;
    for (const f of fs.readdirSync(cdir).sort()) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      let j;
      try { j = JSON.parse(fs.readFileSync(path.join(cdir, f), "utf8")); }
      catch (e) { console.warn(`  ! ${coll}/${f}: not valid JSON, skipped`); continue; }
      const body = unwrap(j);
      if (body === null) continue;
      if (!body || typeof body !== "object" || Array.isArray(body)) { console.warn(`  ! ${coll}/${id}: not an object, skipped`); continue; }
      if (!id || id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)) { console.warn(`  ! ${coll}/${id}: id not allowed in Firestore, skipped`); continue; }
      const data = encode(body);
      const bytes = Buffer.byteLength(JSON.stringify(data));
      out.push({ coll, id, data, bytes });
    }
  }
  return out;
}

function listUsers(docs) {
  const prefs = docs.filter((d) => d.coll === "prefs");
  const prof = new Map(docs.filter((d) => d.coll === "profiles").map((d) => [d.id, d.data.name]));
  if (!prefs.length) return console.log("No prefs/ docs in the export.");
  console.log("Players in the export (make-invites.js makes one invite code per player after the import):\n");
  const rows = prefs.map((d) => {
    const p = d.data;
    const joined = p.joinedAt ? new Date(p.joinedAt).toISOString().slice(0, 10) : "";
    return { id: d.id, team: p.team || "", name: prof.get(d.id) || "", joined, cards: p.cards ? Object.keys(p.cards).length : 0 };
  }).sort((a, b) => a.team.localeCompare(b.team));
  console.table(rows);
}

async function main() {
  const docs = readExport();
  const byColl = {};
  for (const d of docs) byColl[d.coll] = (byColl[d.coll] || 0) + 1;

  if (args["list-users"]) return listUsers(docs);

  console.log(`Export: ${dir}`);
  console.table(byColl);
  const tooBig = docs.filter((d) => d.bytes > MAX_DOC_BYTES);
  tooBig.forEach((d) => console.warn(`  ! ${d.coll}/${d.id} is ${d.bytes} bytes (over Firestore's 1 MiB), skipped`));
  const todo = docs.filter((d) => d.bytes <= MAX_DOC_BYTES);

  if (args["dry-run"]) {
    console.log(`Dry run: would write ${todo.length} docs (${tooBig.length} skipped). Nothing written.`);
    return;
  }

  const { db } = await openFirestore(args);
  // Batches: at most 400 writes and ~8 MB each (Firestore caps a commit at 500 writes / 10 MiB).
  let batch = db.batch(), n = 0, bytes = 0, written = 0;
  const flush = async () => {
    if (!n) return;
    await batch.commit();
    written += n;
    process.stdout.write(`\r  written ${written}/${todo.length}`);
    batch = db.batch(); n = 0; bytes = 0;
  };
  for (const d of todo) {
    if (n >= 400 || bytes + d.bytes > 8_000_000) await flush();
    batch.set(db.collection(d.coll).doc(d.id), d.data);
    n++; bytes += d.bytes;
  }
  await flush();
  console.log(`\nDone: ${written} docs imported${tooBig.length ? `, ${tooBig.length} skipped (too big)` : ""}.`);
}

main().catch((e) => { console.error("\n" + (e && e.message || e)); process.exit(1); });
