"""Owner-requested one-off data fixes (manual workflow "Admin fix"). Each fix is idempotent: it records itself in config/fixes.
  kjflap: King Julian's Cheese Farm usage today -5,000 (owner, Oct 23).
  gift20k: 20,000 BB from the House to every player with a team (owner, Oct 24).
  zcelestial: Chancellor Zartog loses the Celestial aura, no refund (owner, Oct 25).
  zhrollback: Zartog + hung like hernandez cards back to the Oct 23 snapshot (min), +75,000 each (owner, Oct 25).
  kjloan: 1M House loan, 0%, due 5 minutes after King Julian's next visit (owner, Oct 24).
  kjspin: one free Daily Spin for King Julian (owner, Oct 24)."""
import sys, time
from common import db
from google.cloud import firestore
fs = db(); fix = sys.argv[1] if len(sys.argv) > 1 else ""
done = fs.collection("config").document("fixes")
if (done.get().to_dict() or {}).get(fix): print("already done:", fix); sys.exit(0)
if fix == "kjflap":
    ref = fs.collection("prefs").document("u_8M5oXNoWRCzPXZOwJ2g3nA")
    @firestore.transactional
    def run(tx):
        x = ref.get(transaction=tx).to_dict() or {}
        old = int(x.get("flapToday") or 0); new = max(0, old - 5000)
        # liveT moves forward so an older batched value waiting in live/{id} can't win over this
        tx.update(ref, {"flapToday": new, "liveT": int(time.time() * 1000), "wv": "fix." + str(int(time.time()))})
        return old, new, x.get("flapDay")
    print("flapToday", run(fs.transaction()))
elif fix == "statreset":
    # Oct 23 (owner): leaderboards/stats start over. Snapshot every player's stat fields into prefs.sb0; the app shows value - sb0.
    # Balances are untouched (they keep reading the raw fields).
    def n(x, k): v = x.get(k); return v if isinstance(v, (int, float)) else 0
    def crsum(b):
        if isinstance(b, dict): return sum(v for v in b.values() if isinstance(v, (int, float)))
        return 0
    cnt = 0
    for d in fs.collection("prefs").stream():
        x = d.to_dict() or {}
        if x.get("sb0"): continue
        sb0 = {"bjPL": n(x, "bjNet") + n(x, "bjBonus") + n(x, "revengeEarn"), "crPL": n(x, "crNet") + crsum(x.get("crBets")), "at": int(time.time() * 1000)}
        for k in ["bjHands", "rlNet", "rlSpins", "crRolls", "hlNet", "hlRounds", "rrNet", "rrWins", "rrGames", "thNet", "thWins", "thGames", "flapEarn", "flapPlays"]:
            sb0[k] = n(x, k)
        d.reference.update({"sb0": sb0, "wv": "fix." + str(int(time.time()))}); cnt += 1
    print("stat baselines written:", cnt)
elif fix == "gift20k":
    # Oct 24 (owner): the House gives every player 20,000 BB, one bank doc each (the ledger credits from:"house" docs like any transfer in).
    now = int(time.time() * 1000); cnt = 0
    for d in fs.collection("prefs").stream():
        x = d.to_dict() or {}
        if not x.get("team"): continue
        fs.collection("bank").document("gift20k_" + d.id).set({"from": "house", "to": d.id, "amt": 20000, "kind": "gift", "note": "House gift", "at": now, "wv": "fix." + str(now)})
        cnt += 1; print("gift", d.id, x.get("team"))
    print("gifts written:", cnt)
elif fix == "kjspin":
    # Oct 24 (owner): one free Daily Spin for King Julian (prefs.whFree +1; the app counts used ones by bank docs wheel_<id>_free<n>)
    ref = fs.collection("prefs").document("u_8M5oXNoWRCzPXZOwJ2g3nA")
    ref.update({"whFree": firestore.Increment(1), "wv": "fix." + str(int(time.time()))})
    print("whFree now", (ref.get().to_dict() or {}).get("whFree"))
elif fix == "kjloan":
    # Oct 24 (owner): King Julian gets a 1,000,000 BB House loan at 0%, repay in 5 minutes, opened by his own page on his next visit (no chat post)
    ref = fs.collection("prefs").document("u_8M5oXNoWRCzPXZOwJ2g3nA")
    ref.update({"giftLoan": {"id": int(time.time() * 1000), "P": 1000000, "mins": 5, "note": "House loan"}, "wv": "fix." + str(int(time.time()))})
    print("giftLoan", (ref.get().to_dict() or {}).get("giftLoan"))
elif fix == "zhrollback":
    # Oct 25 (owner): Chancellor Zartog + hung like hernandez bought up packs with High-Low exploit money. Their collections go back to the
    # Oct 23 2:21 PM snapshot: each card count becomes min(now, snapshot) (gains removed, nothing they traded away comes back);
    # the removed copies simply return to the pack supply. No refund. Then each gets 75,000 BB from the House (owner).
    import base64, json, zlib
    SNAP = json.loads(zlib.decompress(base64.b64decode("eNqNVt+PnDgM/l943kg4hF/zNlVPaitVfTmp1b1UATKQXSAcMDM7V+3/fiZsIJ7bvbuX0QQ7tmN//uxfwfnn41+fks+Z6j5+KP/8Ln98aT7/+PnpGBx+Bd2FyXFmWXCIH4K2Y/WobgwgOMCDk0WxFb6eRGJlq6rq73TjNDhkD8HQscb0dXBIrORkzMxK+aR8VdRMt0PCg0O0B8DRCbfCSlasMFVwELs0Ii7TxLpEYdGeFQNryAWLoUNoj50c28KMhj2edakK82w9bA6Fb3Jx78Um3KlslJpNw4rRTL6bSGxu7HV8DHjGIfWNJ5mfTsiIIfBlfHvnqC6qrxUzJzY3iik5zWpkxbnvb/YC5rvWtbRZQvVF53Tuy1mb3n0bZKlPumS9GefmqqYZjU5qvGw1KeWJ1XIp2vrYU6sH/DH4M+pK3myc6KhSRXFzl+pRDk0nn5/1ctFPaEphwkN3pdNtK0fWmd4aFXtiInqFZE1kJMUp+BUSi/E1i5XGp5vRpuDayFb5HrJFL92xEpO6WBg5HIMD1RoLgUec+aoidzWrjZwx76p1ysO5YOUor+2GZswdBij7ik1LafZap4sHYRM8FENwyNe/ep5mM/iKsZU59CQr0twxtR2HF+MwLPVayq0i/hMg8p+w9PBuJYr83Ma5s1npzoGtVbU29vvOA5mr3nAeh1bRlEHuuMACm7QAX+q+qj4ahTjsXjO42c6cqVkipkvZstamsDwXkkSeucgbtZyxXU66l31JiSfb/E3NqJ5JnGKTDUoNCCM9EQ85SbjgG/AshHIfbZy+OfULl1L2I7J4z4cVgpfom41wD8C21e4y2mpVmc6PJc0JLQo/slhsbxoXoi4UcstTr+tm9ssUhaQDgUyMiO/tXdmrWMe5bFysV90jY01smrGgKDPITrqlDyPdmBIQpiEBDOmBJHTdInWlSFPlW3IqfUH3SA0S6YewjgBSl5hgP3b57My8AGFtmfk2LS+YdO8oz7IJAbwgJRWR7xJilzt7L/ILGoekNIkrG9LIMCF/yH7JobmSO9z5KhvZDUj6U4PcXWCSK6cHlndRZMs7uWm7jszQt5YkZPgnJPMEfK9TbyOY3OvaG6NmUoJp2PumlMMsdc8uGNqMj/Rxilri5SH4/dvlKH97+nK8qA/ieiz++BhfvldfT0/1kb/uMB5x7Nez+y3mLT76J1OI+13nLaJYFh1+v9x4PEHYVpBTQk48JfcIiBY+4WQPAcIgdGMBwjycLEERZRdCLv9jxQCfYYAyxzvEcb9U8HeWCk5GPCcTHsiE52SO8/fGfUR4AgiHcMIaZPaDzxrRf5AGhPf7AJB9AO73AU74Bt5ocEcT8E67A2l3oCsA2QD+rZWBNC9pT+8abRW4a0kg85aTqQ4vL38D6RGj4Q==")))
    now = int(time.time() * 1000)
    for pid, snap in SNAP.items():
        ref = fs.collection("prefs").document(pid)
        @firestore.transactional
        def run(tx):
            x = ref.get(transaction=tx).to_dict() or {}
            cur = {k: int(v) for k, v in (x.get("cards") or {}).items() if isinstance(v, (int, float))}
            new = {k: min(v, int(snap.get(k, 0))) for k, v in cur.items()}
            new = {k: v for k, v in new.items() if v > 0}
            tx.update(ref, {"cards": new, "liveT": now, "wv": "fix." + str(now), "zhRollback": now})
            return sum(cur.values()), sum(new.values())
        print(pid, "cards before/after", run(fs.transaction()))
        fs.collection("bank").document("gift75k_" + pid).set({"from": "house", "to": pid, "amt": 75000, "kind": "gift", "note": "House gift", "at": now, "wv": "fix." + str(now)})
elif fix == "ownhltry":
    # Oct 25 5:05 PM: the High-Low tournament card covered the screen for the owner; give back the try it used.
    for d in fs.collection("bank").where("kind", "==", "tourney").stream():
        x = d.to_dict() or {}
        if x.get("from") == "u_IfmXeDmDg1B3W4naCzVbSA" and x.get("g") == "hl" and x.get("day") == "2026-10-25":
            d.reference.update({"tries": max(0, int(x.get("tries") or 0) - 1), "wv": "fix." + str(int(time.time()))}); print("tries", x.get("tries"), "-> -1")
elif fix == "zhflap0":
    # Oct 25 4:59 PM (owner): Zartog + hung like hernandez "Earned today" on the Cheese Farm back to 0 (their Silo can fill again today). Balances untouched.
    now = int(time.time() * 1000)
    for pid in ["u_jzH6I8emDBcqWaXJhIX_HA", "TOvAaEkJAveB4wAbZD5vWdMfkgA2"]:
        ref = fs.collection("prefs").document(pid)
        x = ref.get().to_dict() or {}
        ref.update({"flapToday": 0, "liveT": now, "wv": "fix." + str(now)})
        print(pid, "flapToday", x.get("flapToday"), "-> 0", "flapDay", x.get("flapDay"))
elif fix == "zhfarm":
    # Oct 25 (owner): Chancellor Zartog + hung like hernandez Cheese Farm Press and Silo each down 2 levels (min 0). No refund, farmSpent unchanged.
    now = int(time.time() * 1000)
    for pid in ["u_jzH6I8emDBcqWaXJhIX_HA", "TOvAaEkJAveB4wAbZD5vWdMfkgA2"]:
        ref = fs.collection("prefs").document(pid)
        x = ref.get().to_dict() or {}
        p0, s0 = int(x.get("fpPress") or 0), int(x.get("fpSilo") or 0)
        ref.update({"fpPress": max(0, p0 - 2), "fpSilo": max(0, s0 - 2), "wv": "fix." + str(now)})
        print(pid, "press", p0, "->", max(0, p0 - 2), "silo", s0, "->", max(0, s0 - 2))
elif fix == "zcelestial":
    # Oct 25 (owner): Chancellor Zartog loses the Celestial aura (bought with High-Low exploit money). No refund; unequipped if worn.
    ref = fs.collection("prefs").document("u_jzH6I8emDBcqWaXJhIX_HA")
    x = ref.get().to_dict() or {}
    up = {"auras.celestial": firestore.DELETE_FIELD, "wv": "fix." + str(int(time.time()))}
    if x.get("aura") == "celestial": up["aura"] = None
    ref.update(up)
    print("auras now", sorted(((ref.get().to_dict() or {}).get("auras") or {}).keys()), "equipped", (ref.get().to_dict() or {}).get("aura"))
elif fix == "wwopen":
    # Oct 28 (owner): BiggieTown released to everyone (the match server lets anyone in when config/ww.open is true)
    fs.collection("config").document("ww").set({"open": True, "at": int(time.time() * 1000)}, merge=True)
    print("config/ww", fs.collection("config").document("ww").get().to_dict())
else:
    print("unknown fix", fix); sys.exit(1)
done.set({fix: int(time.time() * 1000)}, merge=True)
