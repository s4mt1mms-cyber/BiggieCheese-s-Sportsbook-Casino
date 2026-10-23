import unittest
from scoreboard import team, best_fill

SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "SUPER_FLEX"]
SC = {"pts": 1}
def mk(n):  # n players per position with descending projections
    pl, proj, ids = {}, {}, []
    for pos, base in (("QB", 20), ("RB", 15), ("WR", 14), ("TE", 9)):
        for k in range(n):
            pid = f"{pos}{k}"; ids.append(pid); pl[pid] = {"team": "T" + pid, "pos": [pos]}; proj[pid] = {"pts": base - k}
    return pl, proj, ids


class T(unittest.TestCase):
    def test_benched_lineup_still_projects_best(self):
        pl, proj, ids = mk(4)
        best = team({"starters": ["0"] * 9, "players": ids}, proj, SC, pl, {}, SLOTS)[1]
        normal = team({"starters": ["QB0", "RB0", "RB1", "WR0", "WR1", "WR2", "TE0", "RB2", "QB1"], "players": ids}, proj, SC, pl, {}, SLOTS)[1]
        # best: QB 20, RB 15+14, WR 14+13+12, TE 9, FLEX RB2 13, SF QB1 19
        self.assertEqual(best, 129.0); self.assertEqual(normal, 129.0)
        bad = team({"starters": ["QB3", "RB3", "0", "0", "0", "0", "TE3", "0", "0"], "players": ids}, proj, SC, pl, {}, SLOTS)[1]
        self.assertEqual(bad, 129.0)

    def test_locked_starters_count_actual(self):
        pl, proj, ids = mk(4)
        left = {"TQB3": 0.0}  # QB3's game is over: he's locked in at his actual 2 points
        e = {"starters": ["QB3", "0", "0", "0", "0", "0", "0", "0", "0"], "players": ids, "players_points": {"QB3": 2}}
        a, p, r, f = team(e, proj, SC, pl, left, SLOTS)
        # QB slot is QB3 (2 actual); SUPER_FLEX gets QB0 20; rest RB 15+14, WR 14+13+12, TE 9, FLEX RB2 13
        self.assertEqual(a, 2.0); self.assertEqual(p, 2 + 20 + 15 + 14 + 14 + 13 + 12 + 9 + 13)

    def test_started_bench_player_cannot_fill(self):
        pl, proj, ids = mk(2)
        left = {"TQB0": 0.5}  # QB0 on the bench, game in progress: can't be subbed in
        e = {"starters": ["0"] * 9, "players": ids}
        p = team(e, proj, SC, pl, left, SLOTS)[1]
        self.assertEqual(p, 19 + 15 + 14 + 14 + 13 + 9 + 8)  # QB1 at QB; RBs; WRs (2 only); TE0; FLEX TE1 8; SF nobody left

    def test_taxi_excluded(self):
        pl, proj, ids = mk(2)
        e = {"starters": ["0"] * 9, "players": ids}
        self.assertLess(team(e, proj, SC, pl, {}, SLOTS, {"QB0"})[1], team(e, proj, SC, pl, {}, SLOTS)[1])

    def test_no_slots_old_behaviour(self):
        pl, proj, ids = mk(2)
        e = {"starters": ["QB0", "RB0"], "players": ids}
        self.assertEqual(team(e, proj, SC, pl, {})[1], 35.0)


if __name__ == "__main__":
    unittest.main()
