"""Hourly: real NBA games -> our own lines (meta/nba) and per-day results (nba/{YYYYMMDD}).

Same model as nfl.py (pricing and grading are imported from it, so both sports carry the same standard casino edge:
decimal (2.1/2.2)/p per side, a coin flip pays -110; spreads and totals -110 both sides).
Win probability: ESPN's matchup predictor (BPI); if a game has none, the feed's posted spread is turned into a chance
(normal margin, sd 12); with neither, the game gets no lines. Totals use the feed's posted over/under number only.
Lines are offered for today's and tomorrow's games (ET). Results are kept per ET date of the scheduled tip in
nba/{YYYYMMDD}.g[espnId]; a game that isn't final by the end of the day after its scheduled date (ET) is void (refund).
Finals and voids never change once written.
"""
import math, sys
from datetime import datetime, timedelta
from statistics import NormalDist
from common import ET, get_json, now_ms
from nfl import moneyline, half, HALF_PRICE, kick_ms, parse_events, EDGE  # noqa: F401  (EDGE re-exported for tests)

SB = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
PRED = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/{e}/competitions/{e}/predictor"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={e}"
SD = 12.0            # NBA final-margin standard deviation (points)
P_MIN, P_MAX = 0.02, 0.98
N = NormalDist()


def spread_line(p_home):
    p = min(max(float(p_home), P_MIN), P_MAX)
    v = math.floor(-SD * N.inv_cdf(p) * 2 + 0.5) / 2
    return 0.0 if v == 0 else v


def p_from_spread(home_spread):
    """Posted home spread (negative = home favored) -> home win chance."""
    return N.cdf(-float(home_spread) / SD)


def lines_for(g, p_home, total):
    if g["state"] != "pre" or p_home is None: return {}
    out = {"ml": moneyline(p_home), "spread": {"line": spread_line(p_home), "price": HALF_PRICE}}
    if total is not None: out["total"] = {"line": half(total), "price": HALF_PRICE}
    return out


def day_id(ms):
    return datetime.fromtimestamp(ms / 1000, ET).strftime("%Y%m%d")


def void_deadline(kick_ms_):
    """End of the day (ET) after the scheduled tip date, in ms."""
    d = datetime.fromtimestamp(kick_ms_ / 1000, ET).date()
    return int(datetime.combine(d + timedelta(days=2), datetime.min.time(), ET).timestamp() * 1000)


def day_doc_games(prev, events, now):
    g = dict(prev or {})
    for e in events:
        old = g.get(e["id"]) or {}
        if old.get("final") or old.get("void"): continue
        k0 = old.get("kick0") or e["kick"]
        row = {"a": e["away"], "h": e["home"], "an": e["an"], "hn": e["hn"], "kick": e["kick"], "kick0": k0,
               "st": e["state"], "d": e["detail"], "as": e["as"], "hs": e["hs"], "final": False, "void": False}
        if now >= void_deadline(k0): row["void"] = True
        elif e["state"] == "post" and e["completed"]: row["final"] = True; row["finalAt"] = now
        g[e["id"]] = row
    for eid, row in g.items():
        if not row.get("final") and not row.get("void") and now >= void_deadline(row.get("kick0") or row["kick"]):
            g[eid] = {**row, "void": True}
    return g


def posted_spread(sb_event):
    """Home spread from the feed's odds, if any."""
    try:
        c = sb_event["competitions"][0]
        for o in c.get("odds") or []:
            v = o.get("spread")
            if isinstance(v, (int, float)): return float(v)
    except Exception:
        pass
    return None


def predictor(eid):
    try:
        d = get_json(PRED.format(e=eid), timeout=30)
        gp = lambda side: next((s["value"] for s in d[side]["statistics"] if s.get("name") == "gameProjection"), None)
        h, a = gp("homeTeam"), gp("awayTeam")
    except Exception:
        try:
            p = get_json(SUMMARY.format(e=eid), timeout=30).get("predictor") or {}
            h, a = float(p["homeTeam"]["gameProjection"]), float(p["awayTeam"]["gameProjection"])
        except Exception:
            return None
    if not (isinstance(h, (int, float)) and isinstance(a, (int, float))) or h + a <= 0: return None
    return h / (h + a)


def main():
    from common import db
    fs = db(); now = now_ms(); today = datetime.now(ET).date()
    days = [(today + timedelta(days=k)).strftime("%Y%m%d") for k in (-1, 0, 1)]
    feeds = {}
    for dd in days:
        try: feeds[dd] = get_json(f"{SB}?dates={dd}")
        except Exception as e: print("ESPN unavailable for", dd, e)
    coll = fs.collection("nba")
    open_days = {d.id: d.to_dict() for d in coll.where("done", "==", False).stream()}
    todo = set(open_days) | set(feeds)
    for did in sorted(todo):
        try:
            sb = feeds.get(did) or get_json(f"{SB}?dates={did}")
        except Exception as e:
            print("ESPN unavailable for", did, e); continue
        ev = [x for x in parse_events(sb) if day_id(x["kick"]) == did]
        prev = open_days.get(did)
        if prev is None:
            snap = coll.document(did).get(); prev = snap.to_dict() if snap.exists else None
        games = day_doc_games((prev or {}).get("g"), ev, now)
        if not games: continue
        done = all(x.get("final") or x.get("void") for x in games.values())
        doc = {"day": did, "g": games, "done": done}
        if not prev or {k: prev.get(k) for k in doc} != doc:
            coll.document(did).set({**doc, "updatedAt": now})
            print(f"{did}: results saved ({sum(1 for x in games.values() if x['final'])} final, "
                  f"{sum(1 for x in games.values() if x['void'])} void, done={done})")
    rows = []
    for dd in days[1:]:
        sb = feeds.get(dd)
        if not sb: continue
        raw = {str(e["id"]): e for e in sb.get("events") or []}
        for g in parse_events(sb):
            if day_id(g["kick"]) != dd: continue
            p, src = None, None
            if g["state"] == "pre":
                p = predictor(g["id"]); src = "bpi" if p is not None else None
                if p is None:
                    sp = posted_spread(raw.get(g["id"]) or {})
                    if sp is not None: p, src = p_from_spread(sp), "spread"
            row = {"id": g["id"], "wk": dd, "away": g["away"], "home": g["home"], "an": g["an"], "hn": g["hn"], "kick": g["kick"],
                   "status": g["state"], "detail": g["detail"], "awayScore": g["as"], "homeScore": g["hs"],
                   "pHome": round(p, 4) if p is not None else None, "src": src}
            row.update(lines_for(g, p, g["ou"]))
            rows.append(row)
    rows.sort(key=lambda r: (r["kick"], r["id"]))
    fs.collection("meta").document("nba").set({"days": days[1:], "wk": days[1], "games": rows, "fetchedAt": now})
    print(f"meta/nba written: {len(rows)} games, {sum(1 for r in rows if r.get('ml'))} with open lines.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("NBA job failed:", repr(e)); sys.exit(1)
