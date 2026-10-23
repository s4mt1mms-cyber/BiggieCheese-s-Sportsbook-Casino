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


ELIG = {"QB": {"QB"}, "RB": {"RB"}, "WR": {"WR"}, "TE": {"TE"}, "K": {"K"}, "DEF": {"DEF"},
        "FLEX": {"RB", "WR", "TE"}, "WRRB_FLEX": {"RB", "WR"}, "REC_FLEX": {"WR", "TE"}, "SUPER_FLEX": {"QB", "RB", "WR", "TE"}}


def best_fill(slots, pool):
    """Fill lineup slots with the highest-projected eligible players. pool = [(proj, pid, positions)].
    Dedicated slots first, then the flex slots from narrowest to widest (optimal for these nested slot types)."""
    order = sorted(range(len(slots)), key=lambda i: len(ELIG.get(slots[i], ())))
    free = sorted(pool, key=lambda x: -x[0]); used = set(); out = {}
    for i in order:
        el = ELIG.get(slots[i])
        if not el: continue
        for pr, pid, pos in free:
            if pid not in used and pos & el:
                used.add(pid); out[i] = (pid, pr); break
    return out


def team(entry, proj, scoring, players, left, slots=None, bench_out=()):
    """Odds use each team's BEST possible lineup from its roster, not the lineup it has set (owner, Oct 23: benching everyone
    to tank the projection, betting yourself at +5000 and subbing back in). Starters whose NFL game has already started are
    locked (their actual points count, as in Sleeper); every other starting slot is filled with the best eligible rostered
    player whose game hasn't started (taxi/IR excluded). Actual points still only ever come from real starters."""
    pp = entry.get("players_points") or {}
    actual = rem = full = 0.0
    starters = list(entry.get("starters") or [])
    team_of = lambda pid: (players.get(str(pid)) or {}).get("team") or (str(pid) if str(pid).isalpha() else None)
    def frac(pid):
        a = float(pp.get(str(pid)) or 0); nfl = team_of(pid)
        return a, left.get(nfl, 1.0 if (nfl and not a) else 0.0)
    if not slots: slots = [None] * len(starters)
    locked, open_slots = set(), []
    for i, pid in enumerate(starters):
        if pid in (None, "0", 0): open_slots.append(i); continue
        a, f = frac(pid)
        if f >= 1.0 and not a: open_slots.append(i); continue
        locked.add(str(pid)); pr = proj_pts(pid, proj, scoring); full += pr; actual += a; rem += pr * f
    if open_slots:
        if any(slots[i] for i in open_slots):
            pool = []
            for pid in entry.get("players") or []:
                pid = str(pid)
                if pid in locked or pid in bench_out: continue
                a, f = frac(pid)
                if not (f >= 1.0 and not a): continue  # already playing / played: can't be moved into the lineup any more
                pos = set((players.get(pid) or {}).get("pos") or [])
                if pos: pool.append((proj_pts(pid, proj, scoring), pid, pos))
            for i, (pid, pr) in best_fill([slots[i] for i in open_slots], pool).items():
                full += pr; rem += pr
        else:  # no slot info: the set lineup, as before
            for i in open_slots:
                pid = starters[i]
                if pid in (None, "0", 0): continue
                pr = proj_pts(pid, proj, scoring); full += pr; rem += pr
    return round(actual, 2), round(actual + rem, 2), rem, full


def fair(p):
    p = min(max(p, 0.005), 0.995)
    o = -round(100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)
    o = max(-5000, min(5000, o))
    if abs(o) < 100: o = 100
    if o == -100: o = 100
    return o


def build(week, matchups, proj, scoring, players, left, now, slots=None, out_by_roster=None):
    groups = {}
    for m in matchups: groups.setdefault(m["matchup_id"], []).append(m)
    out = []; live = False
    for g in groups.values():
        if len(g) != 2: continue
        x, y = g
        ob = out_by_roster or {}
        xa, xp, xr, xf = team(x, proj, scoring, players, left, slots, ob.get(x["roster_id"], ())); ya, yp, yr, yf = team(y, proj, scoring, players, left, slots, ob.get(y["roster_id"], ()))
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
    pl = {k: {"team": v.get("team"), "pos": v.get("fantasy_positions") or ([v["position"]] if v.get("position") else [])} for k, v in players.items() if isinstance(v, dict)}
    slots = [x for x in (league.get("roster_positions") or []) if x not in ("BN", "IR", "TAXI")]
    try:
        rosters = get_json(f"{SLEEPER}/rosters")
        out = {r["roster_id"]: {str(p) for p in (r.get("taxi") or []) + (r.get("reserve") or [])} for r in rosters}
    except Exception as e:
        print("rosters unavailable:", e); out = {}
    sb = build(week, matchups, proj, scoring, pl, game_left(espn), now_ms(), slots, out)
    if not sb["matchups"] or all(not (m["ap"] or m["bp"] or m["as"] or m["bs"]) for m in sb["matchups"]):
        print("All projected and actual points are 0 - nothing written."); return
    db().collection("meta").document("scoreboard").set(sb)
    live = sum(1 for e in espn.get("events", []) if e["status"]["type"]["state"] == "in")
    fin = sum(1 for e in espn.get("events", []) if e["status"]["type"]["state"] == "post")
    fav = max(sb["matchups"], key=lambda m: m["apct"])
    print(f"Week {week}: {live} NFL games live, {fin} final. Biggest favorite: {fav['a']} {fav['aml']} ({fav['apct']}%).")


if __name__ == "__main__":
    main()
