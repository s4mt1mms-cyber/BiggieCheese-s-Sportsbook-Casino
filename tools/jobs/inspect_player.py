"""Read-only: print a player's balance-relevant data (prefs money fields, bank docs, loans, open bets) by team name. Usage: inspect_player.py "<team>" """
import sys, json, time
from common import db
fs = db(); want = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
now = time.time() * 1000
pid = None
for d in fs.collection("prefs").stream():
    x = d.to_dict() or {}
    if want and want in str(x.get("team", "")).lower():
        pid = d.id
        keys = [k for k in x if isinstance(x[k], (int, float)) and k not in ("joinedAt",)]
        print("prefs", d.id, x.get("team"), {k: x[k] for k in sorted(keys)})
if not pid: print("no player"); sys.exit(0)
adj = fs.collection("adjust").document(pid).get(); print("adjust", adj.to_dict() if adj.exists else None)
for b in fs.collection("bank").stream():
    x = b.to_dict() or {}
    if x.get("from") == pid or x.get("to") == pid or pid in (x.get("pay") or {}) or pid in (x.get("tos") or []):
        print("bank", b.id, {k: x.get(k) for k in ("kind", "from", "to", "amt", "each", "note")}, "age_h", round((now - (x.get("at") or 0)) / 36e5, 1))
for l in fs.collection("loans").stream():
    x = l.to_dict() or {}
    if pid in (x.get("lender"), x.get("borrower")):
        print("loan", l.id, {k: x.get(k) for k in ("status", "lender", "borrower", "P", "rate", "hof")}, "payments", [(p.get("amt"), round((now - (p.get("at") or 0)) / 36e5, 1)) for p in x.get("payments") or []][-8:])
for b in fs.collection("bets").stream():
    x = b.to_dict() or {}
    if pid in (x.get("posterId"), x.get("takerId")) and x.get("status") in ("open", "live"):
        print("bet", b.id, {k: x.get(k) for k in ("status", "type", "gameId", "stake", "takerStake", "cut10", "stake0", "posterId", "takerId", "createdAt")})
for m in fs.collection("market").stream():
    x = m.to_dict() or {}
    if pid in (x.get("seller"), x.get("buyer")) and x.get("status") == "sold":
        print("market", m.id, x.get("price"), "seller" if x.get("seller") == pid else "buyer", round((now - (x.get("at") or 0)) / 36e5, 1))
for bid in (sys.argv[2:] if len(sys.argv) > 2 else []):
    x = fs.collection("bets").document(bid).get().to_dict() or {}
    print("betdetail", bid, {k: x.get(k) for k in ("createdAt", "acceptedAt", "stake", "takerStake", "odds", "legs", "status")})
