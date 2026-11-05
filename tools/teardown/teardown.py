"""Owner Nov 5 2026: erase the app. MODE=check lists what exists; MODE=delete deletes every Firestore document and every Auth user."""
import json, os, sys
import firebase_admin
from firebase_admin import credentials, auth, firestore

mode = os.environ.get("MODE", "check")
sa = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"])
firebase_admin.initialize_app(credentials.Certificate(sa), {"projectId": "biggiecheesesportsbook"})
db = firestore.client()

cols = list(db.collections())
print("Firestore collections:", len(cols))
for c in cols:
    n = sum(1 for _ in c.list_documents(page_size=500))
    print(f"  {c.id}: {n} docs")
    if mode == "delete":
        db.recursive_delete(c)
        print(f"    deleted {c.id}")

uids = []
page = auth.list_users()
while page:
    uids += [u.uid for u in page.users]
    page = page.get_next_page()
print("Auth users:", len(uids))
if mode == "delete":
    for i in range(0, len(uids), 1000):
        r = auth.delete_users(uids[i:i + 1000])
        print(f"  deleted {r.success_count}, failed {r.failure_count}")

if mode == "delete":
    left = list(db.collections())
    print("Collections left:", [c.id for c in left])
    if left:
        sys.exit(1)
