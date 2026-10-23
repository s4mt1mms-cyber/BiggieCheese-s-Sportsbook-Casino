"""Owner-requested one-off data fixes (manual workflow "Admin fix"). Each fix is idempotent: it records itself in config/fixes.
  kjflap: King Julian's Cheese Farm usage today -5,000 (owner, Oct 23)."""
import sys, time
from common import db
from google.cloud import firestore
fs = db(); fix = sys.argv[1] if len(sys.argv) > 1 else ""
done = fs.collection("config").document("fixes")
if (done.get().to_dict() or {}).get(fix): print("already done:", fix); sys.exit(0)
if fix == "kjflap":
    ref = fs.collection("prefs").document("u_8M5oXNoWRCzPXZOwJ2g3nA")
    @firestore.transactional
    def run(tx):
        x = ref.get(transaction=tx).to_dict() or {}
        old = int(x.get("flapToday") or 0); new = max(0, old - 5000)
        # liveT moves forward so an older batched value waiting in live/{id} can't win over this
        tx.update(ref, {"flapToday": new, "liveT": int(time.time() * 1000), "wv": "fix." + str(int(time.time()))})
        return old, new, x.get("flapDay")
    print("flapToday", run(fs.transaction()))
else:
    print("unknown fix", fix); sys.exit(1)
done.set({fix: int(time.time() * 1000)}, merge=True)
