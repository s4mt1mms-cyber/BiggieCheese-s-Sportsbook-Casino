import unittest
from datetime import datetime
from common import ET
from nhl import lines_for, void_deadline, day_doc_games, day_id, rates, win_p, puck_line, p_from_ml
from nfl import dec_of


def ms(y, m, d, h=0, mi=0):
    return int(datetime(y, m, d, h, mi, tzinfo=ET).timestamp() * 1000)


class NHL(unittest.TestCase):
    def test_rates(self):
        lh, la = rates(0.62, 6.0)
        self.assertAlmostEqual(lh + la, 6.0, places=9)
        self.assertAlmostEqual(win_p(lh, la), 0.62, places=6)

    def test_puck_line(self):
        pl = puck_line(0.62, 6.0)
        self.assertEqual(pl["line"], -1.5)
        h, a = pl["price"]["home"], pl["price"]["away"]
        self.assertGreater(h, 100)        # favorite -1.5 is plus money
        self.assertLess(a, -100)          # dog +1.5 is minus money
        self.assertLess(1 / dec_of(h) + 1 / dec_of(a), 1.06)
        self.assertGreater(1 / dec_of(h) + 1 / dec_of(a), 1.03)   # house edge kept
        pl2 = puck_line(0.38, 6.0)
        self.assertEqual(pl2["line"], 1.5)
        self.assertEqual(pl2["price"]["away"], h)    # mirror image

    def test_lines(self):
        L = lines_for({"state": "pre"}, 0.5, 6.3)
        self.assertEqual(L["ml"], {"home": -110, "away": -110})
        self.assertEqual(L["total"], {"line": 6.5, "price": -110})
        self.assertEqual(lines_for({"state": "in"}, 0.5, 6), {})
        self.assertAlmostEqual(p_from_ml(-150, 130), (1 / dec_of(-150)) / (1 / dec_of(-150) + 1 / dec_of(130)), places=12)

    def test_void_and_day(self):
        k = ms(2026, 10, 24, 19, 0)
        self.assertEqual(day_id(k), "20261024")
        self.assertEqual(void_deadline(k), ms(2026, 10, 26))
        ev = [{"id": "1", "kick": k, "state": "post", "completed": True, "detail": "Final/SO", "away": "BOS", "home": "NYR",
               "an": "Bruins", "hn": "Rangers", "as": 3, "hs": 2}]
        g = day_doc_games({}, ev, k + 3 * 36e5)
        self.assertTrue(g["1"]["final"])
        ev2 = [{**ev[0], "state": "pre", "completed": False}]
        self.assertTrue(day_doc_games({}, ev2, ms(2026, 10, 26, 0, 1))["1"]["void"])


if __name__ == "__main__":
    unittest.main()
