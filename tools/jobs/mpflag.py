"""Turn server-hosted live tables on or off: sets config/mp.serverHost. Prints the server heartbeat."""
import sys, time
from common import db
on = (sys.argv[1] if len(sys.argv) > 1 else "on").lower() in ("on", "true", "1", "yes")
ref = db().collection("config").document("mp")
cur = (ref.get().to_dict() or {})
beat = cur.get("beat")
age = (time.time() * 1000 - beat) / 1000 if beat else None
print("server heartbeat:", "none yet" if age is None else f"{age:.0f}s ago")
if on and (age is None or age > 300):
    print("Heartbeat missing or stale - not turning on. Wait a couple of minutes and run again."); sys.exit(1)
ref.set({"serverHost": on}, merge=True)
print("serverHost =", on)
