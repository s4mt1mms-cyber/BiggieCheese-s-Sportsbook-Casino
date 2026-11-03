# BiggieCheese's Sportsbook & Casino

A **play-money** web app for our fantasy football league ("Debbie's Dynasty Dozen").
Everything runs on **BiggieBucks (BB)**: fake money only. No real money, payments or cash-out, ever.

- Live site: **https://biggiecheesesportsbook.web.app**
- Firebase project: `biggiecheesesportsbook` (Hosting, Firestore, Cloud Functions, Auth)
- Owner / admin: the repo owner (s4mt1mms@gmail.com)
- About 10 players, mostly on iPhone, many using the site as a home-screen app

> **New here? Read [`CLAUDE.md`](CLAUDE.md) next.** It's the detailed guide to how every system works
> (cards, casino, loans, bank, sportsbook, live tables) and the rules for changing them.
> Claude Code reads it automatically when you open the repo.

---

## The 5 rules

1. **A push to `main` deploys to production** (about 2 minutes). Players are usually mid-game, so only push
   code that's been checked. Work on a **branch** and open a **pull request** for the owner to review.
2. **Balances must stay exactly right.** Anything that touches money (bets, casino, cards, loans, bank,
   live tables) needs a test that reconciles balances before and after, down to the BB.
3. **Don't change game rules, odds, payouts or prices unless the owner asked.** Pack odds especially.
4. **Card art rules:** no copyrighted characters, no sexualised edits of real people, and blur the faces of
   minors or bystanders.
5. **Keep it cheap:** the app is tuned to stay inside a small Firestore budget. Don't add listeners on whole
   collections.

Every player-visible change also gets a short **"What's new"** entry (search `const NEWS` in
`public/index.html`, add a new entry at the top with the next `v` number).

---

## What's in the repo

```
public/index.html          THE APP: one big file (HTML + CSS + JS). Very long lines, see "Editing" below.
public/js/firebase-shim.js sign-in gate, invite codes, and the small `db` API the app uses on top of Firestore
public/js/western.js       BiggieTown (the 3D western town game)
public/cards/              card art (WebP), public/skins/ table skins, public/icons/ app icons
functions/                 Cloud Functions: server host for live Russian Roulette + Texas Hold'em
  lib/thpure.js, codec.js  GENERATED from index.html by scripts/sync-shared.mjs. Don't edit by hand.
server/                    BiggieTown match server (Cloud Run)
firestore.rules            who can read and write what
tools/jobs/                Python jobs run by GitHub Actions (scores, odds, NFL/NBA/NHL lines, grading, fixes)
tools/test/                Node tests (slots return, card abilities)
tools/migrate/             one-time import scripts (artifact era)
.github/workflows/         deploy on push to main + the scheduled jobs
```

## How it works (short version)

- **Sign-in:** Google, email + password, or an emailed link. New players need a one-time **invite code**
  (Admin tab → Invite codes). Redeeming one ties the sign-in to a player id.
- **Data:** Firestore. The app calls `db.doc(...)` / `db.collection(...)`; `firebase-shim.js` maps that onto
  Firestore (`update()` deep-merges nested objects).
- **Balances are computed, not stored:** `ledger().balOf(id)` adds up bets, casino results, card money,
  bank/loan activity and adjustments. A new money source must be added to the ledger.
- **Stale-tab guard:** every write carries a version stamp (`wv`), and the rules refuse writes from old
  copies of the app. If you write to Firestore outside the shim, include a fresh `wv`.
- **Updates:** the deploy stamps a build id; open apps show "New update ready · tap to refresh".

---

## Getting set up

You need Node 20+, Python 3.11+, and Java (for the Firestore emulator).

```bash
git clone https://github.com/s4mt1mms-cyber/BiggieCheese-s-Sportsbook-Casino.git
cd BiggieCheese-s-Sportsbook-Casino
cd functions && npm ci && cd ..
```

Run everything locally with the Firebase emulators (no production data is touched):

```bash
npx firebase-tools emulators:start --project biggiecheesesportsbook --only auth,firestore,functions,hosting
# then open http://localhost:5000/?emu   (the ?emu flag points the app at the emulators)
```

In `?emu` mode the page exposes `SB_DEV_SIGNIN(email)` in the browser console for quick test sign-ins.
Playwright (Chromium) works well for phone-sized checks: emulate 390×844 and 375×667.

**Never commit production data.** Exports from the `job-econ` workflow contain players' personal data.

## Editing `public/index.html`

The file is huge and many lines are thousands of characters long, so don't open it in one go.

- Find things with: `grep -n -o ".\{0,120\}someName.\{0,200\}" public/index.html`
- Make edits with small scripts (`python3` `str.replace` + `assert s.count(old)==1`) or careful editor search.
- Global state lives in `S` (`S.me` = my player id, `S.prefs[id]` = a player's doc, `S.tab` = current page);
  `render()` redraws.

**Before every push, run these. Both must pass:**

```bash
# syntax-check every inline script
python3 -c "
import re;s=open('public/index.html').read()
for i,m in enumerate(re.finditer(r'<script([^>]*)>(.*?)</script>',s,re.S)):
  if 'src=' in m.group(1):continue
  open(f'/tmp/s{i}'+('.mjs' if 'module' in m.group(1) else '.js'),'w').write(m.group(2))"
for f in /tmp/s*.js /tmp/s*.mjs; do node --check $f || echo FAIL $f; done

# the functions deploy is blocked if the generated files are out of sync
cd functions && node scripts/sync-shared.mjs --check
```

Other tests:

```bash
cd functions && npm test                       # live-table game engines
node tools/test/slots.test.mjs                 # slots return
node tools/test/mv-abilities.test.mjs          # card ability math
cd tools/jobs && python3 -m unittest           # NFL/NBA/NHL lines + scoreboard
```

After a push, check the deploy went green:
`gh api repos/s4mt1mms-cyber/BiggieCheese-s-Sportsbook-Casino/actions/runs?per_page=1`

---

## Working together

- Two people now change this repo, so **don't push straight to `main`**. Make a branch
  (`git checkout -b my-change`), push it, and open a pull request. Merging it to `main` is what deploys.
- Keep commits small; the message should say what players will notice.
- When you change how something works, update `CLAUDE.md` so the next person (or Claude) knows.
- Ask the owner before anything risky: money logic, migrations that touch every player, rules changes,
  odds/prices.

## Scheduled jobs (GitHub Actions)

| Workflow | What it does |
|---|---|
| `job-scoreboard.yml` | always-on loop: Sleeper live scores + odds, NFL/NBA/NHL lines and results |
| `job-grade.yml` | grades finished league games (Tuesdays, with retries) |
| `job-futures.yml` | playoff/title odds (Tuesdays) |
| `job-moneyreport.yml` | daily money report for the Admin tab |
| `job-fix.yml` | named one-off data fixes (`tools/jobs/admin_fix.py`), run by hand |
| `job-mpflag.yml` | switch the live tables between the server and phone hosting |
| `deploy-biggietown.yml` | deploys the BiggieTown server when `server/` changes |

They use the `FIREBASE_SERVICE_ACCOUNT` repository secret (owner-managed).

## Phone / iOS gotchas

- Anything pinned to the top or bottom must respect `env(safe-area-inset-top/bottom)`.
- Inputs need a font size of at least 16px, or iOS zooms in.
- Global keyboard shortcuts must ignore typing in inputs (`keyInField(e)`).
- Replacing an icon or card image: bump its cache-busting version (`?v=N`, `MV_IMGV` etc.).
