"""Hourly: live Sleeper scores + projections and fair (zero-edge) moneylines -> meta/scoreboard.

Same logic as the old "BiggieCheese live scores & odds" scheduled task.
For each starter: game not started = full projection; in progress = actual + projection for the
fraction of game time left; final = actual only. Win probability tightens as less of the week remains.
"""
import json, math, re, sys
from common import TEAMS, SLEEPER, board_week, get_json, now_ms, db

SIGMA = 33.0
FIX = {"WSH": "WAS", "JAC": "JAX", "LA": "LAR"}


def game_left(espn):
    """NFL team -> fraction of its game still to play (1 = not started, 0 = final)"""
    left = {}
    for e in espn.get("events", []):
        s = e["status"]; st = s["type"]["state"]; per = s.get("period") or 0
        if st == "pre": f = 1.0
        elif st == "post": f = 0.0
        else:
            m = re.match(r"(\d+):(\d+)", s.get("displayClock", "0:00"))
            clk = (int(m.group(1)) + int(m.group(2)) / 60) if m else 0
            f = 0.0 if per > 4 else max(0.0, min(1.0, ((4 - per) * 15 + clk) / 60))
        for c in e["competitions"][0]["competitors"]:
            a = c["team"]["abbreviation"]; left[FIX.get(a, a)] = f
    return left


def proj_pts(pid, proj, scoring):
    st = proj.get(str(pid)) or {}
    return sum(v * scoring.get(k, 0) for k, v in st.items() if isinstance(v, (int, float)))


def team(entry, proj, scoring, players, left):
    pp = entry.get("players_points") or {}
    actual = rem = full = 0.0
    for pid in entry.get("starters") or []:
        if pid in (None, "0", 0): continue
        pr = proj_pts(pid, proj, scoring); full += pr
        a = float(pp.get(str(pid)) or 0)
        nfl = (players.get(str(pid)) or {}).get("team") or (str(pid) if str(pid).isalpha() else None)
        f = left.get(nfl, 1.0 if (nfl and not a) else 0.0)
        if f >= 1.0 and not a: rem += pr
        else: actual += a; rem += pr * f
    return round(actual, 2), round(actual + rem, 2), rem, full


def fair(p):
    p = min(max(p, 0.005), 0.995)
    o = -round(100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)
    o = max(-5000, min(5000, o))
    if abs(o) < 100: o = 100
    if o == -100: o = 100
    return o


def build(week, matchups, proj, scoring, players, left, now):
    groups = {}
    for m in matchups: groups.setdefault(m["matchup_id"], []).append(m)
    out = []; live = False
    for g in groups.values():
        if len(g) != 2: continue
        x, y = g
        xa, xp, xr, xf = team(x, proj, scoring, players, left); ya, yp, yr, yf = team(y, proj, scoring, players, left)
        if xa or ya: live = True
        if yp > xp: x, y, xa, xp, xr, xf, ya, yp, yr, yf = y, x, ya, yp, yr, yf, xa, xp, xr, xf
        tot = xf + yf; frac = (xr + yr) / tot if tot > 0 else 1.0
        sig = max(3.0, SIGMA * math.sqrt(min(1.0, frac)))
        p = 0.5 * (1 + math.erf((xp - yp) / (sig * math.sqrt(2))))
        if xr + yr < 0.01: p = 1.0 if xp > yp else 0.5
        apct = min(99, max(50, int(round(p * 100))))
        aml = fair(p); bml = -aml if aml != 100 else 100
        out.append({"a": TEAMS.get(x["roster_id"], str(x["roster_id"])), "ap": xp, "as": xa,
                    "b": TEAMS.get(y["roster_id"], str(y["roster_id"])), "bp": yp, "bs": ya,
                    "apct": apct, "aml": aml, "bml": bml, "aspread": -(round((xp - yp) * 2) / 2)})
    out.sort(key=lambda m: -m["ap"])
    return {"mode": "proj", "live": live, "week": week, "updatedAt": now, "matchups": out}


def main():
    week = board_week()
    if week > 17:
        print("season over"); return
    if week < 1:
        print("season not started"); return
    league = get_json(SLEEPER)
    matchups = get_json(f"{SLEEPER}/matchups/{week}")
    projlist = get_json(f"https://api.sleeper.app/projections/nfl/2026/{week}?season_type=regular"
                        "&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF")
    players = get_json("https://api.sleeper.app/v1/players/nfl", timeout=180)
    try:
        espn = get_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
    except Exception as e:
        print("ESPN unavailable:", e); espn = {"events": []}
    scoring = league["scoring_settings"]
    proj = {str(e["player_id"]): e.get("stats") or {} for e in projlist if isinstance(e, dict) and e.get("player_id")}
    pl = {k: {"team": v.get("team")} for k, v in players.items() if isinstance(v, dict)}
    sb = build(week, matchups, proj, scoring, pl, game_left(espn), now_ms())
    if not sb["matchups"] or all(not (m["ap"] or m["bp"] or m["as"] or m["bs"]) for m in sb["matchups"]):
        print("All projected and actual points are 0 - nothing written."); return
    db().collection("meta").document("scoreboard").set(sb)
    live = sum(1 for e in espn.get("events", []) if e["status"]["type"]["state"] == "in")
    fin = sum(1 for e in espn.get("events", []) if e["status"]["type"]["state"] == "post")
    fav = max(sb["matchups"], key=lambda m: m["apct"])
    print(f"Week {week}: {live} NFL games live, {fin} final. Biggest favorite: {fav['a']} {fav['aml']} ({fav['apct']}%).")


if __name__ == "__main__":
    main()
