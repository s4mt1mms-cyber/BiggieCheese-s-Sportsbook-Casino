"""Owner-requested one-off data fixes (manual workflow "Admin fix"). Each fix is idempotent: it records itself in config/fixes.
  kjflap: King Julian's Cheese Farm usage today -5,000 (owner, Oct 23).
  gift20k: 20,000 BB from the House to every player with a team (owner, Oct 24).
  kjspin: one free Daily Spin for King Julian (owner, Oct 24)."""
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
elif fix == "statreset":
    # Oct 23 (owner): leaderboards/stats start over. Snapshot every player's stat fields into prefs.sb0; the app shows value - sb0.
    # Balances are untouched (they keep reading the raw fields).
    def n(x, k): v = x.get(k); return v if isinstance(v, (int, float)) else 0
    def crsum(b):
        if isinstance(b, dict): return sum(v for v in b.values() if isinstance(v, (int, float)))
        return 0
    cnt = 0
    for d in fs.collection("prefs").stream():
        x = d.to_dict() or {}
        if x.get("sb0"): continue
        sb0 = {"bjPL": n(x, "bjNet") + n(x, "bjBonus") + n(x, "revengeEarn"), "crPL": n(x, "crNet") + crsum(x.get("crBets")), "at": int(time.time() * 1000)}
        for k in ["bjHands", "rlNet", "rlSpins", "crRolls", "hlNet", "hlRounds", "rrNet", "rrWins", "rrGames", "thNet", "thWins", "thGames", "flapEarn", "flapPlays"]:
            sb0[k] = n(x, k)
        d.reference.update({"sb0": sb0, "wv": "fix." + str(int(time.time()))}); cnt += 1
    print("stat baselines written:", cnt)
elif fix == "gift20k":
    # Oct 24 (owner): the House gives every player 20,000 BB, one bank doc each (the ledger credits from:"house" docs like any transfer in).
    now = int(time.time() * 1000); cnt = 0
    for d in fs.collection("prefs").stream():
        x = d.to_dict() or {}
        if not x.get("team"): continue
        fs.collection("bank").document("gift20k_" + d.id).set({"from": "house", "to": d.id, "amt": 20000, "kind": "gift", "note": "House gift", "at": now, "wv": "fix." + str(now)})
        cnt += 1; print("gift", d.id, x.get("team"))
    print("gifts written:", cnt)
elif fix == "kjspin":
    # Oct 24 (owner): one free Daily Spin for King Julian (prefs.whFree +1; the app counts used ones by bank docs wheel_<id>_free<n>)
    ref = fs.collection("prefs").document("u_8M5oXNoWRCzPXZOwJ2g3nA")
    ref.update({"whFree": firestore.Increment(1), "wv": "fix." + str(int(time.time()))})
    print("whFree now", (ref.get().to_dict() or {}).get("whFree"))
else:
    print("unknown fix", fix); sys.exit(1)
done.set({fix: int(time.time() * 1000)}, merge=True)
