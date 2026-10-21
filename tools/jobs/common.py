"""Shared helpers for the scheduled league jobs (run by GitHub Actions).

Reads the service-account JSON from the FIREBASE_SERVICE_ACCOUNT env var and
writes documents to the site's Firestore database.
"""
import json, os, time, urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

LEAGUE = "1311995884023590912"
SLEEPER = f"https://api.sleeper.app/v1/league/{LEAGUE}"
ET = ZoneInfo("America/New_York")
SEASON_START = datetime(2026, 9, 8, tzinfo=ET)  # Tuesday of board week 1

# Sleeper roster_id -> the board's team names
TEAMS = {1: "Chancellor Zartog", 2: "KING JULIAN", 3: "BiggieCheese Oppenheimer", 4: "hung like hernandez",
         5: "The K9 Unit", 6: "ניו יורק יהודים", 7: "Agarthan Empire", 8: "KingSlop", 9: "#Footbaw",
         10: "L.A.N.K", 11: "#CTESPN", 12: "The 1000 year dynasty"}


def now_ms():
    return int(time.time() * 1000)


def board_week(now=None):
    """Board weeks run Tuesday-Monday starting 2026-09-08 (week 1)."""
    now = now or datetime.now(ET)
    return (now - SEASON_START).days // 7 + 1


def get_json(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "biggiecheese-jobs/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def db():
    from google.cloud import firestore
    from google.oauth2 import service_account
    info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
    creds = service_account.Credentials.from_service_account_info(info)
    return firestore.Client(project=info.get("project_id") or "biggiecheesesportsbook", credentials=creds)
