# BiggieCheese's Sportsbook

The league's play-money ("BiggieBucks") sportsbook, casino and card-pack app,
moved off the Claude artifact and onto Firebase so it has its own web address,
real sign-in and its own database.

- Live site: https://biggiecheesesportsbook.web.app
- Firebase project: `biggiecheesesportsbook`

Every push to `main` deploys the site and the database security rules
automatically (GitHub Actions).

---

## What's in here

```
public/                    the website (Firebase Hosting serves this folder)
  index.html               the app itself (same code as the artifact, plus the sign-in gate)
  js/firebase-config.js    the project's Firebase web config
  js/firebase-shim.js      sign-in, invite codes, and the database adapter the app talks to
  js/invites-admin.js      "Invite codes" section of the Admin tab (admins only)
  js/codec.js              small data converter shared with the migration tool
  css/gate.css             sign-in screen + invite admin styles
  manifest.webmanifest     Add to Home Screen details
  icons/                   app icons
  sw.js                    service worker (installable app, updates show on next open)
firebase.json              hosting settings + local emulator settings
.firebaserc                which Firebase project to deploy to
firestore.rules            who can read and write what
firestore.indexes.json     database index settings
.github/workflows/         auto-deploy on push to main
tools/migrate/             one-time scripts to copy the artifact data into Firebase
```

## How it works (short version)

**Sign-in.** People sign in with Google, or with an emailed sign-in link (no
password; handy for Yahoo/Outlook users).

**Invite codes.** Signing in alone doesn't get you in. The first time, you see
"BiggieCheese's Sportsbook is invite-only" and enter an invite code (or open an
invite link, which fills the code in). Each code works once. Redeeming one
creates a *link* record that ties your sign-in to a team:

- An invite made for an existing team carries that team's old artifact player
  id, so the person keeps that team's balance, bets, cards and history.
- A "New player" invite starts a brand-new player with the normal starting
  balance.

The commish makes codes in the app: **Admin tab → Invite codes**. Each team
has a "Make invite code" button; each code has Copy link / Share / Revoke, and
once used it shows who claimed it, with a "Remove access" button.

**Owner.** `s4mt1mms@gmail.com` is always an admin and is linked automatically
to BiggieCheese Oppenheimer (`u_IfmXeDmDg1B3W4naCzVbSA`) on first sign-in, so
no code is needed. To add more admins, create the doc `config/admins` with a
field `emails` (an array of lower-case emails) in the Firebase console. An
extra admin still needs to have joined with an invite code first.

**The app code barely changed.** The artifact gave the app a small database
object (`db`) and a `user` object. `firebase-shim.js` builds the same two
objects on Firebase, so every game and feature runs unchanged. Details:

| App expects (artifact) | Shim does (Firebase) |
|---|---|
| `db.doc(path).get/set/update/delete/onSnapshot` | the same Firestore calls |
| `db.collection(name).add/get/onSnapshot/where/orderBy/limit` | Firestore queries |
| `update()` merges nested objects deeply | nested objects become field paths (`cards.lm1`), so only the touched keys change. Arrays are still replaced whole |
| `snapshot.exists` is true/false | turned into true/false (Firestore uses a function) |
| any JSON, including arrays inside arrays | inner arrays are stored as `{"__arr":[...]}` and turned back on read |
| `undefined` values are dropped | same (`ignoreUndefinedProperties`) |
| `user.id()` (S.me) | `links/{your uid}.oldId`: your old artifact id, or your Firebase uid if you're new |
| `user.isOwner()` (S.canEdit, Admin tab) | bootstrap owner email, or listed in `config/admins` |
| `user.profiles(ids)` (names) | `profiles/{id}.name`, saved from your Google/email name when you sign in |
| "permission" errors | shown as the app's usual "You don't have permission" toast |

One small difference: an update that merges an empty object (`{x:{}}`) does
nothing, rather than creating an empty map. The app reads fields with
fallbacks, so this doesn't matter. The database client keeps no on-device copy
on purpose: the app runs money logic (dividends, loans) right after it loads,
so it must never start from stale data.

**Security rules (`firestore.rules`):**
- Nothing can be read or written unless you're signed in with a verified
  email **and** have redeemed an invite (have a `links/{uid}` doc). The
  bootstrap owner is the one exception.
- A signed-in outsider can only look up one invite by its exact code and claim
  it for themselves, in one step that marks the invite used and creates their
  link. Used or revoked codes can't be claimed. Nobody can list the codes
  except admins.
- `config/*`, `meta/*` (league settings, card sets, futures, scoreboard),
  `adjust/*` (balance adjustments), `cardimg/*`, `invites/*` and removing
  access are admin-only.
- `prefs/{player}` and `profiles/{player}`: only that player (or an admin)
  can write them.
- Everything else (bets, games, market, chat, bank, loans, plat, the
  live-table collections `rrtable/rrin/rrlook/thtable/thin/thhole`, photos,
  media, ...) can be read and written by any member. That's the same trust
  level the artifact had. Phase 2 tightens it (see Roadmap).

---

## Setup checklist (one time, in the Firebase console)

The web config is already in `public/js/firebase-config.js` and the project id
is already in `.firebaserc` and the workflow. You still need to switch on
these services:

1. **Firestore.** Firebase console → Build → Firestore Database → Create
   database → Production mode → pick a US region (e.g. `nam5`). The rules from
   this repo replace the default rules on the first deploy.
2. **Sign-in methods.** Build → Authentication → Get started → Sign-in method:
   - **Google**: Enable, pick your support email, Save.
   - **Email/Password**: Enable, then also turn on **"Email link
     (passwordless sign-in)"**, Save. (Without this, the "Email me a sign-in
     link" button says email sign-in isn't switched on.)
3. **Authorized domains.** Authentication → Settings → Authorized domains.
   `biggiecheesesportsbook.web.app`, `biggiecheesesportsbook.firebaseapp.com`
   and `localhost` are there by default. If you add a custom domain later,
   add it here too.
4. **GitHub deploy key** (lets GitHub Actions deploy). Pick one:
   - Easy way: install the Firebase CLI (`npm i -g firebase-tools`), run
     `firebase login`, then run `firebase init hosting:github` in this folder.
     Answer the prompts with this repo; it creates the
     `FIREBASE_SERVICE_ACCOUNT_BIGGIECHEESESPORTSBOOK` secret. **Rename it**
     (or add a copy) as `FIREBASE_SERVICE_ACCOUNT`, which is what the workflow
     reads. When it asks to overwrite workflow files or `firebase.json`, say
     **no**.
   - Manual way: Google Cloud console → IAM & Admin → Service Accounts →
     Create (e.g. `github-deploy`). Give it the roles **Firebase Hosting
     Admin**, **Firebase Rules Admin**, **Cloud Datastore Index Admin**, **API
     Keys Viewer** and **Service Account User**. Keys → Add key → JSON. Paste
     the whole JSON into GitHub → repo Settings → Secrets and variables →
     Actions → New secret named `FIREBASE_SERVICE_ACCOUNT`.
   - Either way, the account needs **Firebase Rules Admin** and **Cloud
     Datastore Index Admin** to deploy the rules. The `init hosting:github`
     account doesn't have those by default, so add them in IAM.
5. **Deploy.** Push to `main` (or Actions → "Deploy to Firebase on merge" →
   Run workflow). Then open https://biggiecheesesportsbook.web.app.
6. **Plan / costs.** The free (Spark) plan allows 50k document reads and 20k
   writes a day. Each app open loads every bet, game, chat message and
   profile, and the live tables write often (camera position, heartbeats). A
   dozen active players can get close to the limit on busy days. If the site
   starts failing late in the day, switch to Blaze (pay as you go) and set a
   budget alert (Google Cloud → Billing → Budgets, e.g. $5). Normal use should
   cost pennies.

## Moving the data over from the artifact

Do this once, before sending invites. The export holds the league's real data
(names, photos, chat). It stays on your computer: `tools/migrate/export/` is
git-ignored. Don't commit it.

1. Put the export in `tools/migrate/export/`, one folder per collection and one
   file per document, like our existing exports: `export/prefs/u_abc.json`,
   `export/bets/<id>.json`, `export/meta/league.json`, ... Files can be the raw
   document or wrapped as `{"data": {...}}`.
2. Credentials (pick one):
   - `gcloud auth application-default login` with the owner's Google account, or
   - download a service-account key (Firebase console → Project settings →
     Service accounts → Generate new private key), save it as
     `tools/migrate/sa.key.json` (git-ignored) and add `--key sa.key.json` to
     the commands below.
3. In `tools/migrate`:
   ```
   npm install
   node import.js --list-users     # shows every team in the export
   node import.js --dry-run        # checks everything, writes nothing
   node import.js                  # copies it into Firestore (same document ids)
   node make-invites.js            # one invite code per team; prints team -> code -> link
   ```
   `make-invites.js` reads the teams from Firestore, so it includes everyone
   who exists at that point. It skips the owner (auto-linked), anyone already
   signed in, and anyone who already has an unused code. Add `--csv` to save
   the table to a git-ignored CSV.
4. Sign in yourself first (you're linked automatically). Check that your team,
   balance and the Admin tab look right.
5. Text each friend their link (`https://biggiecheesesportsbook.web.app/?invite=CODE`).
   They open it, sign in with Google or an email link, and land on their team.
   Lost a code, or someone used the wrong account? In Admin → Invite codes,
   use "Remove access" and/or make a new code for that team.

Re-running `import.js` overwrites documents with the export again. Don't do
that after people have started playing on the new site.

## Run it locally (optional)

With Java installed and the Firebase CLI:

```
firebase emulators:start            # auth :9099, firestore :8080, site :5000
# in another terminal, load test data into the emulator:
cd tools/migrate && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node import.js --dir <export> && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node make-invites.js
```

Open http://localhost:5000/?emu. The `?emu` switch, which only works on
localhost, points the page at the emulators instead of the real project. In
the browser console, `SB_DEV_SIGNIN("someone@example.com")` signs you in as
anyone without Google.

## Sign-in on iPhone home-screen app

When the site runs as a home-screen app, Google sign-in uses a full-page
redirect instead of a popup. If Google sign-in from the home-screen app ever
loops or fails, the email link always works. The longer-term fix is to sign
in on the same domain:

1. In `public/js/firebase-config.js`, set `authDomain` to
   `biggiecheesesportsbook.web.app`.
2. Google Cloud console → APIs & Services → Credentials → the "Web client
   (auto created by Google Service)" OAuth client → Authorized redirect URIs →
   add `https://biggiecheesesportsbook.web.app/__/auth/handler`.
3. Push.

---

## Roadmap

### Phase 2: make the money server-side (not built yet)

Right now, as in the artifact, each player's browser works out balances and
writes results. The rules stop outsiders and protect admin data, but a
determined member could still edit shared docs from the browser console. The
plan is to move every money-critical action into **Cloud Functions**, with the
server as the only writer of balances:

- **Server-authoritative balances.** Keep a `wallets/{player}` ledger that
  only functions can write. The app reads balances and sends requests
  ("place this bet", "open this pack") instead of writing results.
- **Pack opening.** The server rolls the pulls (rarity odds, sold-out sets,
  platinum burns), takes the cost, adds the cards.
- **Bet settlement.** When a game is final, a function grades every bet and
  parlay and pays out, so it doesn't depend on whose browser saw the result
  first.
- **Dividends,** including the **Debby steal** and the **Peter multiplier**,
  paid once per day by the server.
- **Casino results.** Blackjack, roulette, craps, hi-lo, Russian roulette and
  Texas hold'em outcomes and payouts decided on the server (server-side
  shuffles and spins).
- **Loans processing.** Interest, due dates, auto-repayment and defaults run
  by the server instead of `bkProcess` in whoever's browser is open.
- **Transfers / gifts / marketplace trades,** each done as one server
  transaction, so money can't be duplicated or lost.
- **Scheduled 1 AM ET function** (Cloud Scheduler, `America/New_York`) for
  the daily jobs: dividends, weekly allowance and refills, loan interest, chat
  pruning, week rollover.
- **Multiplayer host on the server.** Today one player's browser "hosts" the
  roulette and hold'em tables (`rrtable`, `thtable`, `thhole`). A function (or
  a small Cloud Run service) should own table state, deal hole cards privately
  (only to their owner) and settle pots. Fast-changing look/camera state
  (`rrlook`) can move to Realtime Database presence to save Firestore writes.
- Then tighten `firestore.rules` so bets, bank, loans, market, plat and the
  table collections become read-only for clients (writes go through functions).
