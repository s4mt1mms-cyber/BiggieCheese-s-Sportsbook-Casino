// Shared helpers for the migration scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

export function defaultProject() {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8"));
    return rc.projects && rc.projects.default;
  } catch (_) {
    return undefined;
  }
}

// Lazily load firebase-admin so --dry-run / --list-users work without `npm install`.
export async function openFirestore(args) {
  const project = args.project || process.env.GCLOUD_PROJECT || defaultProject();
  if (!project || /YOUR_/.test(project)) throw new Error("No Firebase project id. Pass --project <id> or set it in .firebaserc.");
  let admin;
  try {
    admin = (await import("firebase-admin")).default;
  } catch (e) {
    throw new Error("firebase-admin isn't installed. Run `npm install` in tools/migrate first.");
  }
  const opts = { projectId: project };
  if (args.key) opts.credential = admin.credential.cert(JSON.parse(fs.readFileSync(path.resolve(args.key), "utf8")));
  else if (!process.env.FIRESTORE_EMULATOR_HOST) opts.credential = admin.credential.applicationDefault();
  const app = admin.initializeApp(opts);
  const db = app.firestore();
  db.settings({ ignoreUndefinedProperties: true });
  console.log(`Firestore project: ${project}${process.env.FIRESTORE_EMULATOR_HOST ? " (EMULATOR " + process.env.FIRESTORE_EMULATOR_HOST + ")" : ""}`);
  return { admin, db, project };
}
