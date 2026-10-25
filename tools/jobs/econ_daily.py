"""Daily money report (owner, Oct 25). Runs once a day just after the 12:01 AM ET reset (job-moneyreport.yml).

Writes econ/day_<YYYY-MM-DD> (the Eastern day that just ended), admin-only:
  p[id] = {team, f: every numeric prefs field (the raw money/stat counters), cards: copies held,
           bin/bout: BB in/out through bank docs that day by kind, packs: packs opened that day, packSpent}
  d[id] = change of each numeric field since the previous snapshot (only non-zero ones)
  flags = plain-language lines for anything big (>= FLAG BB in one field, or 50+ packs)
The Admin tab shows it next to live balances (the app computes balances; this job only sees the raw fields)."""
import time
from datetime import datetime, timedelta
from common import db, ET

FLAG = 100000
MONEY = {"hlNet": "High-Low", "crNet": "Craps", "rlNet": "Roulette", "bjNet": "Blackjack", "slNet": "Slots", "rrNet": "Russian Roulette",
         "thNet": "Hold'em", "flapEarn": "Cheese Farm", "divEarn": "Dividends", "quickSold": "Quick-sells", "packSpent": "Packs (spent)",
         "farmSpent": "Farm upgrades (spent)", "craftSpent": "Crafting (spent)", "auraSpent": "Auras (spent)", "skinSpent": "Skins (spent)",
         "emoteSpent": "Emotes (spent)", "revengeEarn": "Rat hunt", "bjBonus": "Blackjack bonus", "shineEarn": "Shine", "topUp": "Top-up"}


def main():
    fs = db()
    now = datetime.now(ET)
    day = (now - timedelta(hours=3)).date().isoformat()          # runs ~12:20 AM ET → labels the day that just ended
    start = int(datetime.fromisoformat(day).replace(tzinfo=ET).timestamp() * 1000) + 60000   # 12:01 AM ET
    end = start + 86400000
    prefs = {d.id: d.to_dict() or {} for d in fs.collection("prefs").stream()}
    P = {}
    for pid, x in prefs.items():
        if not x.get("team"):
            continue
        f = {k: v for k, v in x.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}
        cards = sum(int(v) for v in (x.get("cards") or {}).values() if isinstance(v, (int, float)))
        P[pid] = {"team": x.get("team"), "f": f, "cards": cards, "bin": {}, "bout": {}, "packs": 0, "packSpent": 0}

    def add(pid, side, kind, a):
        if pid in P and a:
            P[pid][side][kind] = P[pid][side].get(kind, 0) + a

    for d in fs.collection("bank").stream():
        t = d.to_dict() or {}
        at = t.get("at")
        if not isinstance(at, (int, float)) or not (start <= at < end):
            continue
        kind = str(t.get("kind") or "transfer")
        if kind == "bounty":
            for pid, v in (t.get("pay") or {}).items():
                add(pid, "bout", kind, int(v or 0)); add(t.get("to"), "bin", kind, int(v or 0))
            continue
        if kind == "tithe":
            a = int(t.get("amt") or 0); e = int(t.get("each") or 0)
            if t.get("src") != "win": add(t.get("from"), "bout", kind, a)
            for r in set(t.get("tos") or []): add(r, "bin", kind, e)
            continue
        a = int(t.get("amt") or 0)
        if a > 0 and t.get("from") != t.get("to"):
            add(t.get("from"), "bout", kind, a); add(t.get("to"), "bin", kind, a)
    for d in fs.collection("pulls").where("at", ">=", start).stream():
        t = d.to_dict() or {}
        if t.get("at", 0) < end and t.get("uid") in P:
            P[t["uid"]]["packs"] += 1; P[t["uid"]]["packSpent"] += int(t.get("price") or 0)

    prev = None
    for k in range(1, 8):
        snap = fs.collection("econ").document("day_" + (datetime.fromisoformat(day) - timedelta(days=k)).date().isoformat()).get()
        if snap.exists:
            prev = snap.to_dict(); break
    D, flags = {}, []
    for pid, v in P.items():
        old = ((prev or {}).get("p") or {}).get(pid, {}).get("f", {}) if prev else {}
        dd = {k: v["f"][k] - old.get(k, 0) for k in v["f"] if prev and v["f"][k] != old.get(k, 0)}
        D[pid] = dd
        for k, lbl in MONEY.items():
            if abs(dd.get(k, 0)) >= FLAG:
                flags.append(f"{v['team']}: {lbl} {dd[k]:+,}")
        for kind, a in v["bin"].items():
            if a >= FLAG: flags.append(f"{v['team']}: received {a:,} via {kind}")
        if v["packs"] >= 50: flags.append(f"{v['team']}: opened {v['packs']} packs ({v['packSpent']:,} BB)")
    fs.collection("econ").document("day_" + day).set({"day": day, "at": int(time.time() * 1000), "p": P, "d": D, "flags": flags,
                                                       "prev": (prev or {}).get("day"), "wv": "job." + str(int(time.time()))})
    print("econ day", day, "players", len(P), "flags", len(flags))
    for f in flags: print(" ", f)


if __name__ == "__main__":
    main()
