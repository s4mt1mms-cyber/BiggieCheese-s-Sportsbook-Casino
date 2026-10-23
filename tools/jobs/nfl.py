"""Hourly: real NFL games -> our own lines (meta/nfl) and per-week results (nfl/{season}_{week}).

Lines are OURS, not a sportsbook's. Win probability comes from ESPN's matchup predictor (FPI);
if a game has no predictor, a small margin-based rating model from this season's results is used.
Pricing rule from the owner (Oct 23): a standard casino edge. For a side with win probability p the decimal payout
is (2.1/2.2) / p (a 50/50 side pays -110), turned into American odds rounded in the House's favor.
Spreads come from our win probability (normal margin, sd 13.5) and totals use the posted over/under
number from the free scoreboard feed (just the number) or team scoring averages. Spread and total
sides are ~50/50 by construction, so both pay -110.

The same run records scores/finals in nfl/{season}_{week} so NFL bets grade themselves on every
player's page. A game that isn't final by the end of the Wednesday after its scheduled kickoff (ET)
is marked void (bets refunded). Finals and voids never change once written.
"""
import math, sys
from datetime import datetime, timedelta, timezone
from statistics import NormalDist
from common import ET, get_json, now_ms

SB = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
PRED = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{e}/competitions/{e}/predictor"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={e}"
EDGE = 2.1 / 2.2     # house edge (standard -110): decimal odds = EDGE / p
SD = 13.5            # NFL final-margin standard deviation (points)
HFA = 1.5            # home field (points) for the fallback model
P_MIN, P_MAX = 0.02, 0.98
HALF_PRICE = -110    # spread / total sides: (2.1/2.2) / 0.5 = 1.909 decimal = -110
N = NormalDist()


# ---------------------------------------------------------------- pricing (pure)
def dec_of(am):
    am = int(am)
    return 1 + am / 100 if am > 0 else 1 + 100 / abs(am)


def american(p):
    """American odds paying at most EDGE/p (rounded in the House's favor)."""
    p = min(max(float(p), P_MIN), P_MAX)
    d = max(1.01, EDGE / p)
    if d >= 2:
        am = math.floor(round((d - 1) * 100, 6))
    else:
        am = -math.ceil(round(100 / (d - 1), 6))
        if am >= -100: am = -101
    return int(am)


def moneyline(p_home):
    return {"home": american(p_home), "away": american(1 - p_home)}


def spread_line(p_home):
    """Home team's spread (negative = home favored), rounded to the nearest half point."""
    p = min(max(float(p_home), P_MIN), P_MAX)
    x = -SD * N.inv_cdf(p)
    v = math.floor(x * 2 + 0.5) / 2
    return 0.0 if v == 0 else v


def half(x):
    return math.floor(float(x) * 2 + 0.5) / 2


# ---------------------------------------------------------------- grading (pure; mirrors the app)
def grade_leg(mkt, side, line, away, home, final=False, void=False):
    """'win' | 'loss' | 'push' | None (not settled). Overtime counts. Void = push (refund)."""
    if void: return "push"
    if not final: return None
    a, h = float(away), float(home)
    if mkt == "ml":
        d = (h - a) * (1 if side == "home" else -1)
    elif mkt == "sp":
        d = (h - a if side == "home" else a - h) + float(line)
    elif mkt == "tot":
        d = (a + h - float(line)) * (1 if side == "over" else -1)
    else:
        raise ValueError(mkt)
    return "win" if d > 0 else "loss" if d < 0 else "push"


def grade_parlay(legs, stake):
    """legs: [(result, american_odds)]. Returns (result, payout incl. stake) or (None, None) while pending.
    Pushed/void legs drop out and the parlay re-prices on the rest; all pushed = refund."""
    mult, pending = 1.0, False
    for r, am in legs:
        if r == "loss": return "loss", 0
        if r is None: pending = True; continue
        if r == "win": mult *= dec_of(am)
    if pending: return None, None
    if mult == 1.0: return "push", stake
    return "win", stake + round(stake * (mult - 1))


def void_deadline(kick_ms):
    """End of the Wednesday (ET) after the scheduled kickoff, in ms."""
    d = datetime.fromtimestamp(kick_ms / 1000, ET).date()
    days = (2 - d.weekday()) % 7 or 7
    end = datetime.combine(d + timedelta(days=days + 1), datetime.min.time(), ET)
    return int(end.timestamp() * 1000)


# ---------------------------------------------------------------- data
def kick_ms(iso):
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def parse_events(sb):
    out = []
    for e in sb.get("events") or []:
        c = e["competitions"][0]
        t = {x["homeAway"]: x for x in c["competitors"]}
        if "home" not in t or "away" not in t: continue
        st = e["status"]["type"]
        ou = None
        for o in c.get("odds") or []:
            if isinstance(o.get("overUnder"), (int, float)) and o["overUnder"] > 20:
                ou = float(o["overUnder"]); break
        out.append({
            "id": str(e["id"]), "kick": kick_ms(e["date"]),
            "state": st.get("state"), "completed": bool(st.get("completed")), "sname": st.get("name"),
            "detail": st.get("shortDetail") or st.get("detail") or "",
            "away": t["away"]["team"]["abbreviation"], "home": t["home"]["team"]["abbreviation"],
            "an": t["away"]["team"].get("displayName"), "hn": t["home"]["team"].get("displayName"),
            "as": int(float(t["away"].get("score") or 0)), "hs": int(float(t["home"].get("score") or 0)),
            "ou": ou, "neutral": bool(c.get("neutralSite")),
        })
    return out


def predictor(eid):
    """ESPN matchup predictor: home win probability with ties removed, or None."""
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


def ratings(games):
    """Margin-based ratings (simple SRS) from finished games, regressed to the mean early in the season.
    Returns (rating, points-for avg, points-against avg) per team."""
    teams = {}
    for g in games:
        for k in ("home", "away"): teams.setdefault(g[k], [])
    for g in games:
        hm = g["hs"] - g["as"] - (0 if g.get("neutral") else HFA)
        teams[g["home"]].append((g["away"], hm, g["hs"], g["as"]))
        teams[g["away"]].append((g["home"], -hm, g["as"], g["hs"]))
    r = {t: 0.0 for t in teams}
    for _ in range(50):
        r = {t: (sum(m + r[o] for o, m, _, _ in v) / len(v) if v else 0.0) for t, v in teams.items()}
        mean = sum(r.values()) / len(r) if r else 0
        r = {t: x - mean for t, x in r.items()}
    out = {}
    for t, v in teams.items():
        n = len(v)
        out[t] = (r[t] * n / (n + 3), sum(x[2] for x in v) / n if n else None, sum(x[3] for x in v) / n if n else None)
    return out


def model_p(rt, g):
    rh = (rt.get(g["home"]) or (0, None, None))[0]; ra = (rt.get(g["away"]) or (0, None, None))[0]
    return N.cdf((rh - ra + (0 if g.get("neutral") else HFA)) / SD)


def model_total(rt, g):
    h = rt.get(g["home"]); a = rt.get(g["away"])
    if not h or not a or h[1] is None or a[1] is None: return None
    return half((h[1] + a[2]) / 2 + (a[1] + h[2]) / 2)


def lines_for(g, p_home, total):
    if g["state"] != "pre" or p_home is None: return {}
    out = {"ml": moneyline(p_home), "spread": {"line": spread_line(p_home), "price": HALF_PRICE}}
    if total is not None: out["total"] = {"line": half(total), "price": HALF_PRICE}
    return out


def week_doc_games(prev, events, now):
    """Merge ESPN events into the stored results map. Finals and voids are frozen once written."""
    g = dict(prev or {})
    for e in events:
        old = g.get(e["id"]) or {}
        if old.get("final") or old.get("void"):
            continue
        k0 = old.get("kick0") or e["kick"]
        row = {"a": e["away"], "h": e["home"], "an": e["an"], "hn": e["hn"], "kick": e["kick"], "kick0": k0,
               "st": e["state"], "d": e["detail"], "as": e["as"], "hs": e["hs"], "final": False, "void": False}
        if now >= void_deadline(k0):
            row["void"] = True
        elif e["state"] == "post" and e["completed"]:
            row["final"] = True; row["finalAt"] = now
        g[e["id"]] = row
    for eid, row in g.items():   # games ESPN no longer lists
        if not row.get("final") and not row.get("void") and now >= void_deadline(row.get("kick0") or row["kick"]):
            g[eid] = {**row, "void": True}
    return g


def scoreboard(season, week):
    return get_json(f"{SB}?dates={season}&seasontype=2&week={week}")


def main():
    from common import db
    fs = db(); now = now_ms()
    cur = get_json(SB)
    season = int((cur.get("season") or {}).get("year") or datetime.now(ET).year)
    stype = int((cur.get("season") or {}).get("type") or 2)
    week = int((cur.get("week") or {}).get("number") or 0)
    coll = fs.collection("nfl")
    open_weeks = {d.id: d.to_dict() for d in coll.where("done", "==", False).stream()}
    todo = set(open_weeks)
    if stype == 2 and week >= 1: todo.add(f"{season}_{week}")
    for wid in sorted(todo):
        s, w = (int(x) for x in wid.split("_"))
        try:
            ev = parse_events(cur if (stype == 2 and s == season and w == week) else scoreboard(s, w))
        except Exception as e:
            print("ESPN unavailable for", wid, e); continue
        prev = open_weeks.get(wid)
        if prev is None:
            snap = coll.document(wid).get(); prev = snap.to_dict() if snap.exists else None
        games = week_doc_games((prev or {}).get("g"), ev, now)
        done = bool(games) and all(x.get("final") or x.get("void") for x in games.values())
        doc = {"season": s, "week": w, "g": games, "done": done}
        if not prev or {k: prev.get(k) for k in doc} != doc:
            coll.document(wid).set({**doc, "updatedAt": now})
            print(f"{wid}: results saved ({sum(1 for x in games.values() if x['final'])} final, "
                  f"{sum(1 for x in games.values() if x['void'])} void, done={done})")
    if stype != 2 or week < 1:
        print("No regular-season NFL week right now; lines not written."); return
    ev = parse_events(cur)
    rt = None
    rows = []
    for g in ev:
        p, src = (predictor(g["id"]), "fpi") if g["state"] == "pre" else (None, None)
        total = g["ou"]
        if g["state"] == "pre" and (p is None or total is None) and rt is None:
            past = []
            for w in range(1, week):
                try: past += [x for x in parse_events(scoreboard(season, w)) if x["state"] == "post" and x["completed"]]
                except Exception as e: print("history week", w, e)
            rt = ratings(past)
        if g["state"] == "pre" and p is None: p, src = model_p(rt, g), "model"
        if g["state"] == "pre" and total is None: total = model_total(rt, g)
        row = {"id": g["id"], "away": g["away"], "home": g["home"], "an": g["an"], "hn": g["hn"], "kick": g["kick"],
               "status": g["state"], "detail": g["detail"], "awayScore": g["as"], "homeScore": g["hs"],
               "pHome": round(p, 4) if p is not None else None, "src": src}
        row.update(lines_for(g, p, total))
        rows.append(row)
    rows.sort(key=lambda r: (r["kick"], r["id"]))
    fs.collection("meta").document("nfl").set({"season": season, "week": week, "wk": f"{season}_{week}",
                                               "games": rows, "fetchedAt": now})
    open_n = sum(1 for r in rows if r.get("ml"))
    print(f"meta/nfl written: {season} week {week}, {len(rows)} games, {open_n} with open lines.")
    for r in rows[:4]:
        if r.get("ml"):
            print(f"  {r['away']} @ {r['home']}: pHome {r['pHome']} ({r['src']}) ML {r['away']} {r['ml']['away']:+d} / "
                  f"{r['home']} {r['ml']['home']:+d}, spread {r['home']} {r['spread']['line']:+g}, "
                  f"total {r.get('total', {}).get('line')}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("NFL job failed:", repr(e)); sys.exit(1)
