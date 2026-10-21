/*
 * Value codec shared by the browser shim (public/js/firebase-shim.js) and the
 * migration tool (tools/migrate/import.js), so both store data the same way.
 *
 * The old artifact store took any JSON. Firestore takes almost any JSON too,
 * with two exceptions this codec smooths over:
 *   1. Arrays may not directly contain arrays. An inner array is stored as a
 *      one-key map {"__arr": [...]} and turned back into an array on read.
 *   2. `undefined` is not a value. Keys holding undefined are dropped (the same
 *      thing JSON.stringify did for the artifact store).
 */
export const ARR_KEY = "__arr";

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

export { isPlainObject };

/** App value -> Firestore value. */
export function encode(v, inArray = false) {
  if (v === undefined) return undefined;
  if (typeof v === "number" && !Number.isFinite(v)) return null; // JSON turned NaN/Infinity into null
  if (Array.isArray(v)) {
    const out = v.map((x) => {
      const e = encode(x, true);
      return e === undefined ? null : e; // JSON.stringify writes undefined array slots as null
    });
    return inArray ? { [ARR_KEY]: out } : out;
  }
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      const e = encode(v[k], false);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  return v;
}

/** Firestore value -> app value. */
export function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v !== null && typeof v === "object") {
    // Firestore Timestamps (only present if someone writes them by hand) -> epoch ms like the app uses.
    if (typeof v.toMillis === "function") return v.toMillis();
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === ARR_KEY && Array.isArray(v[ARR_KEY])) return v[ARR_KEY].map(decode);
    const out = {};
    for (const k of keys) out[k] = decode(v[k]);
    return out;
  }
  return v;
}
