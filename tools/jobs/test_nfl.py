"""Tests for the NFL lines and grading rules:  cd tools/jobs && python3 -m unittest test_nfl -v"""
import unittest
from datetime import datetime
from nfl import (american, dec_of, moneyline, spread_line, half, grade_leg, grade_parlay, void_deadline,
                 week_doc_games, HALF_PRICE, EDGE, ratings, model_p)
from common import ET


def ms(y, m, d, h=13, mi=0):
    return int(datetime(y, m, d, h, mi, tzinfo=ET).timestamp() * 1000)


class Pricing(unittest.TestCase):
    def test_both_sides_pay_at_most_edge_over_p(self):
        # Oct 23: standard casino edge, decimal (2.1/2.2)/p, rounded in the House's favor by at most one American point
        for i in range(2, 99):
            p = i / 100
            ml = moneyline(p)
            for side, q in (("home", p), ("away", 1 - p)):
                am = ml[side]
                self.assertLessEqual(dec_of(am), max(1.01, EDGE / q) + 1e-12, (p, side, am))
                better = am + 1 if am > 0 or am < -101 else None
                if better is not None and not (-100 <= better <= 99):
                    self.assertGreater(dec_of(better), EDGE / q - 1e-12, (p, side, am))

    def test_house_has_the_edge(self):
        # implied probabilities of the two sides add up to about 105% (-110 / -110)
        for p in (0.3, 0.5, 0.6, 0.75):
            ml = moneyline(p)
            s = 1 / dec_of(ml["home"]) + 1 / dec_of(ml["away"])
            self.assertGreaterEqual(s, 1 / EDGE - 1e-9)
            self.assertLess(s, 1.08)

    def test_american_examples(self):
        self.assertEqual(american(0.5), -110)
        self.assertEqual(american(0.6), -170)
        self.assertEqual(american(0.4), 138)
        self.assertEqual(american(0.25), 281)
        self.assertEqual(dec_of(-200), 1.5)
        self.assertEqual(dec_of(150), 2.5)

    def test_half_price(self):
        self.assertEqual(HALF_PRICE, -110)
        self.assertAlmostEqual(dec_of(HALF_PRICE), EDGE / 0.5, places=9)


class Spread(unittest.TestCase):
    def test_from_probability(self):
        self.assertEqual(spread_line(0.5), 0.0)
        self.assertEqual(spread_line(0.6), -3.5)     # -13.5 * 0.2533 = -3.42
        self.assertEqual(spread_line(0.4), 3.5)
        self.assertEqual(spread_line(0.75), -9.0)    # -13.5 * 0.6745 = -9.11
        self.assertEqual(spread_line(0.85), -14.0)   # -13.99
        for i in range(2, 99):
            self.assertEqual(spread_line(i / 100) * 2 % 1, 0)
            self.assertEqual(spread_line(i / 100), -spread_line(1 - i / 100))

    def test_half(self):
        self.assertEqual(half(44.3), 44.5)
        self.assertEqual(half(44.2), 44.0)
        self.assertEqual(half(44.75), 45.0)


class Grading(unittest.TestCase):
    def test_moneyline(self):
        self.assertEqual(grade_leg("ml", "home", None, 17, 24, True), "win")
        self.assertEqual(grade_leg("ml", "away", None, 17, 24, True), "loss")
        self.assertEqual(grade_leg("ml", "home", None, 20, 20, True), "push")   # tie
        self.assertIsNone(grade_leg("ml", "home", None, 0, 7, False))
        self.assertEqual(grade_leg("ml", "home", None, 0, 0, False, void=True), "push")

    def test_spread(self):
        # home -3.5 (the bettor's line on the home side)
        self.assertEqual(grade_leg("sp", "home", -3.5, 20, 24, True), "win")
        self.assertEqual(grade_leg("sp", "home", -3.5, 21, 24, True), "loss")
        self.assertEqual(grade_leg("sp", "home", -3, 21, 24, True), "push")
        self.assertEqual(grade_leg("sp", "away", 3, 21, 24, True), "push")
        self.assertEqual(grade_leg("sp", "away", 3.5, 21, 24, True), "win")
        self.assertEqual(grade_leg("sp", "away", 3.5, 20, 24, True), "loss")

    def test_total(self):
        self.assertEqual(grade_leg("tot", "over", 44.5, 21, 24, True), "win")
        self.assertEqual(grade_leg("tot", "under", 44.5, 21, 24, True), "loss")
        self.assertEqual(grade_leg("tot", "over", 45, 21, 24, True), "push")
        self.assertEqual(grade_leg("tot", "under", 45, 21, 24, True), "push")
        self.assertEqual(grade_leg("tot", "under", 45.5, 21, 24, True), "win")

    def test_parlay(self):
        self.assertEqual(grade_parlay([("win", 102), ("win", 102)], 100), ("win", 100 + round(100 * (2.02 * 2.02 - 1))))
        self.assertEqual(grade_parlay([("win", 102), ("loss", 150)], 100), ("loss", 0))
        self.assertEqual(grade_parlay([("loss", 102), (None, 150)], 100), ("loss", 0))
        self.assertEqual(grade_parlay([("win", 102), (None, 150)], 100), (None, None))
        # pushed / void leg drops out: re-prices on the rest (one leg left = straight bet)
        self.assertEqual(grade_parlay([("win", 150), ("push", 102)], 100), ("win", 250))
        self.assertEqual(grade_parlay([("win", -200), ("push", 102), ("win", 102)], 100), ("win", 100 + round(100 * (1.5 * 2.02 - 1))))
        # everything pushed: refund
        self.assertEqual(grade_parlay([("push", 102), ("push", 150)], 100), ("push", 100))


class Void(unittest.TestCase):
    def test_deadline_is_end_of_next_wednesday_et(self):
        thu = ms(2026, 10, 22, 20, 15); sun = ms(2026, 10, 25); mon = ms(2026, 10, 26, 20, 15)
        end_wed = ms(2026, 10, 29, 0, 0)  # Thursday 00:00 ET = end of Wed Oct 28
        self.assertEqual(void_deadline(thu), end_wed)
        self.assertEqual(void_deadline(sun), end_wed)
        self.assertEqual(void_deadline(mon), end_wed)
        self.assertEqual(void_deadline(ms(2026, 10, 28, 13)), ms(2026, 11, 5, 0, 0))  # a Wednesday game: next week's Wed

    def ev(self, **k):
        e = {"id": "1", "kick": ms(2026, 10, 25), "state": "pre", "completed": False, "detail": "",
             "away": "NE", "home": "CHI", "an": "Patriots", "hn": "Bears", "as": 0, "hs": 0}
        e.update(k); return e

    def test_final_then_frozen(self):
        g = week_doc_games({}, [self.ev(state="post", completed=True, **{"as": 20, "hs": 27})], ms(2026, 10, 25, 17))
        self.assertTrue(g["1"]["final"]); self.assertFalse(g["1"]["void"])
        g2 = week_doc_games(g, [self.ev(state="post", completed=True, **{"as": 99, "hs": 0})], ms(2026, 10, 30))
        self.assertEqual((g2["1"]["as"], g2["1"]["hs"], g2["1"]["void"]), (20, 27, False))

    def test_void_when_not_final_by_deadline(self):
        g = week_doc_games({}, [self.ev()], ms(2026, 10, 25, 9))
        self.assertFalse(g["1"]["void"])
        later = week_doc_games(g, [self.ev(kick=ms(2026, 11, 3))], ms(2026, 10, 29, 0, 30))  # postponed past the deadline
        self.assertTrue(later["1"]["void"]); self.assertEqual(later["1"]["kick0"], ms(2026, 10, 25))
        # a void stays void even if a final shows up later
        again = week_doc_games(later, [self.ev(state="post", completed=True, **{"as": 3, "hs": 0})], ms(2026, 11, 4))
        self.assertTrue(again["1"]["void"]); self.assertFalse(again["1"]["final"])
        # games ESPN stops listing also void at the deadline
        gone = week_doc_games(g, [], ms(2026, 10, 29, 1))
        self.assertTrue(gone["1"]["void"])


class Model(unittest.TestCase):
    def test_ratings_favor_the_better_team(self):
        games = [{"home": "A", "away": "B", "hs": 30, "as": 10}, {"home": "B", "away": "C", "hs": 24, "as": 21},
                 {"home": "C", "away": "A", "hs": 7, "as": 28}]
        rt = ratings(games)
        self.assertGreater(rt["A"][0], rt["B"][0])
        self.assertGreater(model_p(rt, {"home": "A", "away": "C"}), 0.6)
        self.assertAlmostEqual(model_p({}, {"home": "X", "away": "Y"}), 0.5442, places=3)  # home field only


if __name__ == "__main__":
    unittest.main()
