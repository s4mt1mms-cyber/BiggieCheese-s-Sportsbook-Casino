"""Turn server-hosted live tables on or off: sets config/mp.serverHost. Prints the server heartbeat."""
import sys, time
from common import db
on = (sys.argv[1] if len(sys.argv) > 1 else "on").lower() in ("on", "true", "1", "yes")
ref = db().collection("config").document("mp")
cur = (ref.get().to_dict() or {})
beat = cur.get("beat")
age = (time.time() * 1000 - beat) / 1000 if beat else None
print("server heartbeat:", "none yet" if age is None else f"{age:.0f}s ago")
if (sys.argv[1] if len(sys.argv) > 1 else "").lower() == "status":
    # read-only: what the live tables look like right now
    print("config/mp:", {k: v for k, v in cur.items() if k != "beat"})
    now = time.time() * 1000
    for col in ("rrtable", "thtable"):
        d = db().collection(col).document("live").get().to_dict() or {}
        seats = {k: {"uid": (v or {}).get("uid"), "age_s": round((now - (v or {}).get("at", 0)) / 1000)} for k, v in (d.get("seats") or {}).items()}
        sv = d.get("sv") or {}
        rsp = sorted(((v or {}).get("at", 0), k, (v or {}).get("ok"), (v or {}).get("msg")) for k, v in (d.get("rsp") or {}).items())[-4:]
        print(col, "state", d.get("state"), "srv", d.get("srv"), "host", d.get("host"), "seats", seats, "ph", sv.get("ph"),
              "dl_in_s", round((sv.get("dl", 0) - now) / 1000) if sv.get("dl") else None, "at_age_s", round((now - (d.get("at") or 0)) / 1000))
        print("   last replies:", [(round((now - a) / 1000), k, ok, m) for a, k, ok, m in rsp])
    for q in db().collection("mpreq").stream():
        x = q.to_dict() or {}; print("mpreq", q.id, x.get("tb"), x.get("a"), "age_s", round((now - (x.get("at") or 0)) / 1000))
    sys.exit(0)
if on and (age is None or age > 300):
    print("Heartbeat missing or stale - not turning on. Wait a couple of minutes and run again."); sys.exit(1)
ref.set({"serverHost": on}, merge=True)
print("serverHost =", on)
