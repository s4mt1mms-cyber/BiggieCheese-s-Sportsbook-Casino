import unittest
from datetime import datetime
from common import ET
from nba import spread_line, p_from_spread, lines_for, void_deadline, day_doc_games, day_id
from nfl import dec_of


def ms(y, m, d, h=0, mi=0):
    return int(datetime(y, m, d, h, mi, tzinfo=ET).timestamp() * 1000)


class NBA(unittest.TestCase):
    def test_lines(self):
        L = lines_for({"state": "pre"}, 0.5, 224.3)
        self.assertEqual(L["ml"], {"home": -110, "away": -110})
        self.assertEqual(L["spread"], {"line": 0.0, "price": -110})
        self.assertEqual(L["total"]["line"], 224.5)
        self.assertEqual(lines_for({"state": "in"}, 0.5, 220), {})
        self.assertLess(spread_line(0.75), 0)           # home favored -> negative home spread
        self.assertAlmostEqual(p_from_spread(-6.5), 1 - p_from_spread(6.5), places=12)

    def test_void_and_day(self):
        k = ms(2026, 10, 23, 19, 30)
        self.assertEqual(day_id(k), "20261023")
        self.assertEqual(void_deadline(k), ms(2026, 10, 25))
        ev = [{"id": "1", "kick": k, "state": "post", "completed": True, "detail": "Final", "away": "BOS", "home": "NYK",
               "an": "Celtics", "hn": "Knicks", "as": 101, "hs": 99}]
        g = day_doc_games({}, ev, k + 3 * 36e5)
        self.assertTrue(g["1"]["final"])
        ev2 = [{**ev[0], "state": "pre", "completed": False}]
        g2 = day_doc_games({}, ev2, ms(2026, 10, 25, 0, 1))
        self.assertTrue(g2["1"]["void"])
        self.assertTrue(day_doc_games(g, ev2, k)["1"]["final"])  # frozen


if __name__ == "__main__":
    unittest.main()
