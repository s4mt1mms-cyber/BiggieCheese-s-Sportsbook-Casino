"""Weekly: season futures odds (make playoffs / win championship) -> meta/futures.

Same simulation as the old "BiggieCheese futures odds" scheduled task.
"""
import json, os, random
from common import TEAMS, SLEEPER, get_json, now_ms, db


def fair(p):
    p = min(max(p, 0.0099), 0.98)
    o = -round(100 * p / (1 - p)) if p >= 0.5 else round(100 * (1 - p) / p)
    if abs(o) < 100: o = 100
    o = max(-5000, min(10000, o))
    step = 5 if abs(o) < 300 else 25 if abs(o) < 1000 else 100 if abs(o) < 5000 else 500
    return int(round(o / step) * step)


def shade(p, base, w):
    return (1 - w) * p + w * base


def run(L, rost, weeks, now, N=20000, seed=7):
    s = L["settings"]
    po_start = s["playoff_week_start"]; n_po = s["playoff_teams"]; done = s.get("last_scored_leg") or 0
    W, LS, PF = {}, {}, {}
    for r in rost:
        st = r["settings"]; rid = r["roster_id"]
        W[rid] = st.get("wins", 0) + 0.5 * st.get("ties", 0); LS[rid] = st.get("losses", 0)
        PF[rid] = st.get("fpts", 0) + st.get("fpts_decimal", 0) / 100
    ids = sorted(W); mean = sum(PF.values()) / len(PF) / max(done, 1)
    mu = {i: 0.6 * (PF[i] / max(done, 1)) + 0.4 * mean for i in ids}; SD = 28.0
    sched = []
    for w in range(done + 1, po_start):
        g = {}
        for e in weeks[w]: g.setdefault(e["matchup_id"], []).append(e["roster_id"])
        sched.append([tuple(v) for v in g.values() if len(v) == 2])
    rng = random.Random(seed); play = {i: 0 for i in ids}; champ = {i: 0 for i in ids}
    for _ in range(N):
        w = dict(W); pf = dict(PF)
        for wk in sched:
            sc = {i: rng.gauss(mu[i], SD) for i in ids}
            med = sorted(sc.values())[len(ids) // 2 - 1:len(ids) // 2 + 1]; med = sum(med) / 2
            for a, b in wk: w[a if sc[a] > sc[b] else b] += 1
            for i in ids:
                pf[i] += sc[i]
                if sc[i] > med: w[i] += 1
        seeds = sorted(ids, key=lambda i: (-w[i], -pf[i]))[:n_po]
        for i in seeds: play[i] += 1
        g = lambda a, b: a if rng.gauss(mu[a], SD) > rng.gauss(mu[b], SD) else b
        if n_po == 6:
            s1, s2, s3, s4, s5, s6 = seeds; x = g(s3, s6); y = g(s4, s5)
            lo, hi = (x, y) if seeds.index(x) > seeds.index(y) else (y, x)
            c = g(g(s1, lo), g(s2, hi))
        else:
            br = seeds[:]
            while len(br) > 1: br = [g(br[i], br[-1 - i]) for i in range(len(br) // 2)]
            c = br[0]
        champ[c] += 1
    out = []
    for i in ids:
        pp = shade(play[i] / N, n_po / len(ids), 0.10); pc = shade(champ[i] / N, 1 / len(ids), 0.12)
        out.append({"t": TEAMS.get(i, str(i)), "w": W[i], "l": LS[i], "pf": round(PF[i], 2),
                    "pPlay": round(pp * 100, 1), "pChamp": round(pc * 100, 1),
                    "mlPlay": fair(pp), "mlChamp": fair(pc)})
    out.sort(key=lambda x: (-x["pChamp"], -x["pPlay"]))
    return {"updatedAt": now, "throughWeek": done, "playoffTeams": n_po, "playoffStart": po_start, "teams": out}


def main():
    L = get_json(SLEEPER); rost = get_json(f"{SLEEPER}/rosters")
    weeks = {n: get_json(f"{SLEEPER}/matchups/{n}") for n in range(1, 18)}
    r = run(L, rost, weeks, now_ms())
    db().collection("meta").document("futures").set(r)
    top = ", ".join(f"{t['t']} {t['mlChamp']:+d}" for t in r["teams"][:3])
    print(f"Futures through week {r['throughWeek']}. Title favorites: {top}")


if __name__ == "__main__":
    main()
