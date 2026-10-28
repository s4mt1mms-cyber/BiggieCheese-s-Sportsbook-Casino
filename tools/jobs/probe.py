"""Read-only: what can the deploy service account set up? (real-time database, Cloud Run, enabled APIs). Creates nothing."""
import json, os
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
info = json.loads(os.environ["FIREBASE_SERVICE_ACCOUNT"]); P = info["project_id"]
cr = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/cloud-platform"]); s = AuthorizedSession(cr)
print("sa", info.get("client_email"), "project", P)
def show(n, r):
    try: j = r.json()
    except Exception: j = r.text[:300]
    print(f"--- {n}: {r.status_code}", json.dumps(j)[:900])
show("rtdb instances", s.get(f"https://firebasedatabase.googleapis.com/v1beta/projects/{P}/locations/-/instances"))
show("cloud run services", s.get(f"https://run.googleapis.com/v2/projects/{P}/locations/us-central1/services"))
r = s.get(f"https://serviceusage.googleapis.com/v1/projects/{P}/services?filter=state:ENABLED&pageSize=200")
try: print("--- enabled:", sorted(x["config"]["name"] for x in r.json().get("services", [])))
except Exception: show("enabled", r)
perms = ["firebasedatabase.instances.create", "firebasedatabase.instances.list", "run.services.create", "run.services.setIamPolicy", "serviceusage.services.enable",
         "iam.serviceAccounts.actAs", "artifactregistry.repositories.create", "cloudbuild.builds.create", "storage.buckets.create", "cloudfunctions.functions.create",
         "resourcemanager.projects.setIamPolicy", "firebase.projects.update"]
show("testIamPermissions", s.post(f"https://cloudresourcemanager.googleapis.com/v1/projects/{P}:testIamPermissions", json={"permissions": perms}))
