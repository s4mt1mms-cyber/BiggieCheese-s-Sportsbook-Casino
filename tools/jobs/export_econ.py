"""Read-only: dump the collections the balance math needs (no chat, DMs, photos or card images) to export/<coll>/<id>.json,
uploaded as a short-lived private Actions artifact for an offline economy analysis (load it into the emulator with tools/migrate/import.js)."""
import json, os
from common import db
fs = db(); out = "export"; n = 0
for coll in ["prefs", "bets", "games", "bank", "market", "loans", "adjust", "offers", "plat", "meta", "nfl", "nba", "nhl", "profiles"]:
    os.makedirs(f"{out}/{coll}", exist_ok=True)
    for d in fs.collection(coll).stream():
        with open(f"{out}/{coll}/{d.id}.json", "w") as f: json.dump(d.to_dict(), f, default=str); n += 1
fx = fs.collection("config").document("fixes").get()
if fx.exists:
    os.makedirs(f"{out}/config", exist_ok=True); json.dump(fx.to_dict(), open(f"{out}/config/fixes.json", "w"), default=str)
print("docs", n)
