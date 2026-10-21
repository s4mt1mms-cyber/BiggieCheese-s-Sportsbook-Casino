"""Grade finished games in the `games` collection from final Sleeper scores.

Port of the old "BiggieCheese hourly results sync" scheduled task (which is currently switched OFF;
its workflow only runs when started by hand from the Actions tab).
Head-to-head games and over/unders are graded automatically. Single-team props are graded only when
the wording is clearly decidable from points alone (e.g. "scores 150+", "wins", "beats X",
"top scorer"); anything else is left for the commissioner and listed in the log.
"""
import re
from datetime import timedelta
from common import TEAMS, SLEEPER, SEASON_START, board_week, get_json, db

NAME2ID = {v: k for k, v in TEAMS.items()}


def week_points(n):
    m = get_json(f"{SLEEPER}/matchups/{n}")
    pts = {TEAMS.get(e["roster_id"], str(e["roster_id"])): float(e.get("points") or 0) for e in m}
    opp = {}
    g = {}
    for e in m: g.setdefault(e["matchup_id"], []).append(TEAMS.get(e["roster_id"], str(e["roster_id"])))
    for pair in g.values():
        if len(pair) == 2: opp[pair[0]] = pair[1]; opp[pair[1]] = pair[0]
    return pts, opp


def current_week_done(week):
    try:
        espn = get_json("https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard")
    except Exception:
        return False
    ev = espn.get("events") or []
    if not ev: return False
    tue = (SEASON_START + timedelta(days=7 * (week - 1))).date().isoformat()
    return all(e["status"]["type"]["state"] == "post" and e.get("date", "")[:10] >= tue for e in ev)


def decide_prop(desc, team, pts, opp):
    d = (desc or "").lower(); p = pts.get(team)
    if p is None: return None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(\+|or more|or better)", d) or re.search(r"over\s+(\d+(?:\.\d+)?)", d)
    if m: return "yes" if p >= float(m.group(1)) else "no"
    m = re.search(r"under\s+(\d+(?:\.\d+)?)", d)
    if m: return "yes" if p < float(m.group(1)) else "no"
    if re.search(r"\btop scorer\b|\bhighest score\b", d): return "yes" if p == max(pts.values()) else "no"
    if re.search(r"\blowest score\b", d): return "yes" if p == min(pts.values()) else "no"
    for name in TEAMS.values():
        if name.lower() in d and name != team and re.search(r"\b(beats|outscores)\b", d):
            return "yes" if p > pts.get(name, 1e9) else "no"
    if re.fullmatch(r"\s*(wins|wins their matchup|wins this week)\s*\.?\s*", d) and team in opp:
        return "yes" if p > pts[opp[team]] else "no"
    if re.fullmatch(r"\s*(loses|loses their matchup)\s*\.?\s*", d) and team in opp:
        return "yes" if p < pts[opp[team]] else "no"
    return None


def main():
    C = board_week(); fs = db()
    docs = [(d.id, d.to_dict()) for d in fs.collection("games").stream()]
    open_weeks = sorted({g.get("week") for _, g in docs if not g.get("final") and isinstance(g.get("week"), int)})
    weeks = [w for w in open_weeks if w < C] + ([C] if C in open_weeks and current_week_done(C) else [])
    if not weeks:
        print("Nothing to grade yet."); return
    graded, needs = [], []
    for w in weeks:
        pts, opp = week_points(w)
        if not pts or all(v == 0 for v in pts.values()): continue
        for gid, g in docs:
            if g.get("final") or g.get("week") != w or (g.get("future") and False): continue
            t = g.get("type"); upd = None
            if not t:
                if g.get("home") in pts and g.get("away") in pts:
                    upd = {"homeScore": pts[g["home"]], "awayScore": pts[g["away"]], "final": True}
            elif t == "total":
                if g.get("scope") == "team" and g.get("team") in pts:
                    upd = {"actual": pts[g["team"]], "final": True}
                elif g.get("away") in pts and g.get("home") in pts:
                    a, b = pts[g["away"]], pts[g["home"]]
                    upd = {"aScore": a, "bScore": b, "actual": round(a + b, 2), "final": True}
            elif t == "prop":
                o = decide_prop(g.get("desc"), g.get("team"), pts, opp)
                if o: upd = {"outcome": o, "final": True}
                else: needs.append(f"{g.get('team')}: {g.get('desc')} (week {w})")
            if upd:
                fs.collection("games").document(gid).update(upd); graded.append(f"week {w} {gid}: {upd}")
    print("\n".join(graded) if graded else "Nothing graded.")
    if needs: print("Needs you:\n" + "\n".join(needs))


if __name__ == "__main__":
    main()
