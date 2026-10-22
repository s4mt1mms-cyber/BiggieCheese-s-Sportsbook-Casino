# CLAUDE.md — BiggieCheese's Sportsbook & Casino

Guide for any Claude (or human) working on this repo. Read this first. The README has the
step-by-step Firebase / GitHub setup; this file is the "how the app works and how not to break it" guide.

## What this is

A **play-money** web app for one friend group's fantasy football league ("Debbie's Dynasty Dozen",
Sleeper league `1311995884023590912`). Currency is **BiggieBucks (BB)** — fake money only. Never add
real-money features, payments, or cash-out of any kind.

- Live site: **https://biggiecheesesportsbook.web.app** (Firebase Hosting, project `biggiecheesesportsbook`, Blaze plan).
- Owner / only admin: **s4mt1mms@gmail.com** (team "BiggieCheese Oppenheimer", old id `u_IfmXeDmDg1B3W4naCzVbSA`).
  The commissioner is Chancellor Zartog (`u_jzH6I8emDBcqWaXJhIX_HA`).
- ~10 players, mostly on iPhone, many using the site as a home-screen app (PWA).
- History: the app started as a single-file Claude artifact and was moved here (Oct 2026). The old artifact
  is retired — all changes now go through this repo.

## Golden rules

1. **Push to `main` = deploy to production** (GitHub Actions: Firestore rules → functions → hosting, ~2 min).
   Only push working, checked code. Players are often mid-game.
2. **Balances must stay exactly right.** Any change touching money (ledger, bets, casino, cards, loans,
   bank, live tables) needs a test that reconciles before/after balances to the BB.
3. **Don't change game rules, odds, payouts or prices unless the owner asked.** Pack pull odds in
   particular must never change as a side effect.
4. **Content rules from the owner:** no copyrighted characters on cards (e.g. a "Vector"/Despicable Me
   card and an Uncle Ruckus card were declined); no sexualized edits of real people (a LeBron card was declined);
   **blur the faces of minors / bystanders** in card art (done for the homecoming card and Dim Futures).
5. Keep it fast and cheap: the app is tuned to stay well inside Firestore free-tier-ish usage (see "Firestore budget").

## Repo layout

```
public/index.html          THE APP. One huge file (~6k lines, very long minified-ish lines): HTML + CSS + JS.
public/js/firebase-shim.js Firebase adapter: auth/sign-in gate, invite codes, and the `db` API the app uses.
public/js/firebase-config.js, codec.js, invites-admin.js, css/gate.css, manifest, sw.js, icons/
functions/                 Cloud Functions (Node 20): server host for live Russian Roulette + Texas Hold'em.
  lib/rr.js, lib/th.js     game engines (ported from the old phone-host code); lib/lobby.js, rng.js
  lib/thpure.js, codec.js  GENERATED from public/index.html by scripts/sync-shared.mjs (don't hand-edit)
  test/engine.test.mjs     `npm test`
firestore.rules            security rules (members only via invite links; admin-only collections)
firebase.json              hosting/functions/emulator config
tools/jobs/*.py            scheduled jobs run by GitHub Actions (Sleeper scores/odds, futures, grading, mp switch)
tools/migrate/             one-time import/invite scripts from the artifact era
.github/workflows/         deploy + scheduled jobs
```

### Working with `public/index.html`
- **Never `cat` it** — lines are thousands of chars long. Use `grep -n -o ".\{0,120\}pattern.\{0,200\}"`
  and Python slicing to read; edit with Python `str.replace` + `assert s.count(old)==1`.
- After editing, syntax-check every inline script:
  ```bash
  python3 -c "
  import re;s=open('public/index.html').read()
  for i,m in enumerate(re.finditer(r'<script([^>]*)>(.*?)</script>',s,re.S)):
    if 'src=' in m.group(1):continue
    open(f'/tmp/s{i}'+('.mjs' if 'module' in m.group(1) else '.js'),'w').write(m.group(2))"
  for f in /tmp/s*.js /tmp/s*.mjs; do node --check $f || echo FAIL $f; done
  cd functions && node scripts/sync-shared.mjs --check   # must pass, or the functions deploy is blocked
  ```
- Global state lives in `S` (S.me = my player id, S.prefs[id] = each player's prefs doc, S.tab = current tab).
  `render()` / `renderSoon()` redraw; `toast()`, `esc()`, `nm(id)` (name), `av(id)`/`pic(id)` avatars.

## Data (Firestore) — `db` API

The app calls `db.doc(path).get/set/update/delete/onSnapshot` and `db.collection(name).add/get/onSnapshot/where/orderBy/limit`
(the old artifact API). `firebase-shim.js` maps it onto Firestore. `update()` deep-merges nested maps (shim turns
nested objects into dotted paths). Arrays-in-arrays are encoded as `{__arr:[...]}` (codec.js).

Identity: Google, email + password, or email-link sign-in (links open in Safari, not the iOS home-screen app,
so password is the home-screen path; password accounts must verify their email, rules need `email_verified`) → `links/{firebaseUid}.oldId` = the player id (`u_...` ids from the artifact
era, or the Firebase uid for new players). New players join with one-time invite codes (`invites/{code}`) made in
the Admin tab.

Key collections:
| collection | what |
|---|---|
| `prefs/{id}` | each player's own doc: team, cards {cardId: count}, all game P/L fields, stats, presence stamps. Written only by that player (and admin). |
| `live/{id}` | high-churn private state (blackjack hand/shoe/streak, roulette/craps/high-low/solo RR state, pending stat deltas). Readable by members (for spectating). |
| `bets`, `games` | sportsbook bets between players / vs the House; games graded from Sleeper. |
| `market` | card listings/trades. `bank` | BB transfers + fees. `loans` | player loans. |
| `offers` | offers on market listings (BB and/or escrowed cards); pages listen to `live==true` only. |
| `dms/{a__b}`, `dms/{a__b}/msgs` | private 1-to-1 chats (pair id = sorted player ids). Rules: only the two players, not even admins. |
| `chat`, `media`, `photos` | chat, chat images (chunked), profile photos. |
| `meta/*` | admin-only: `scoreboard` (hourly odds), `nfl` (NFL lines), `futures`, `league`, `cards_mv` (Multiverse catalog), `plat` (Platinum pack timer). |
| `nfl/{season}_{week}` | admin-only (written by the hourly job): real NFL scores/finals/voids for grading NFL bets. |
| `cardimg/{cardId}` | admin-only card images (`{d: dataURL}`). `adjust/{id}` admin balance adjustments. |
| `plat/slot_N` | Platinum Mysterio pack purchases (5 cards each). |
| `rrtable/live`, `thtable/live`, `thhole/*`, `rrin/*`, `thin/*`, `rrlook/*`, `mpreq/*`, `mptick/*`, `mpsecret/*` | live multiplayer tables (see below). |
| `config/*` | admin-only: `admins`, `mp` (server-host switch). `invites`, `links` | sign-in/invites. |

### Balance (ledger)
Balances are **computed on the client** from data, not stored: `ledger().balOf(id)` = starting base +
sportsbook results − pending stakes + card money (pack spend negative, quick-sells/market) + sum of prefs P/L fields
(`bjNet, bjBonus, gift, flapEarn, mineEarn, rlNet, revengeEarn, crNet, hlNet, rrNet, thNet, divEarn, ...`) +
`adjust` + bank/loan net (`bkNet`: transfers, loan principal/payments). If you add a new money source, it must be
added to the ledger and to the casino P/L lists. Clients are trusted (anyone with devtools could cheat) — Phase 2 in
the README is moving money to Cloud Functions.

### Firestore budget layer
A layer in index.html (search "Firestore budget", `LV_LIVE`, `lvView`, `lvFlush`) keeps reads/writes low:
per-action casino state goes to `live/{me}` (only the player + spectators listen); stat/money fields are batched
into prefs every ~10 s / 20 actions and on page hide; mining saves every 5 min; chat listens to the newest 20/50
only; live tables are only subscribed while at a table. Don't add listeners on whole collections casually.

## Features (where to look)

- **Sportsbook**: player-vs-player bets and House lines/parlays/futures from `meta/scoreboard` + `meta/futures`.
- **NFL bets** (`nfl*`, side menu Sports betting → NFL bets): our own lines on real NFL games vs the House.
  `tools/jobs/nfl.py` (hourly) takes the home win chance from ESPN's matchup predictor (FPI; fallback: margin ratings from
  this season), prices each side at decimal 1.01/p rounded to American odds in the player's favor (owner: "house is down 1%"),
  spread = −13.5·Φ⁻¹(p) to the half point, total = the feed's posted O/U number (or scoring averages); spread/total sides +102.
  `meta/nfl` = current week's games + lines + `fetchedAt` (page listens only while open; betting pauses if >3 h stale).
  `nfl/{season}_{week}.g[espnId]` = scores/`final`/`void` (void if not final by end of the Wednesday ET after kickoff;
  finals/voids frozen once written). Bets are normal House bets with `gameId` `nfl:{season}_{week}:{espnId}:{ml|sp|tot}`
  (+ `side`, `line`, `odds`, `takerStake`, `nfl{}`); parlays are `type:"parlay", nfl:true` with NFL legs only, one per game.
  `gameById()` synthesizes a game from the results doc (`nflGame`), `grade()` → `nflGrade` (OT counts; tie/exact line/void =
  push), so the ledger, My bets, recaps and standings need nothing special. Price is re-checked against `meta/nfl` on submit.
  Rules: NFL bets can only be created before `nfl/{wk}.g[id].kick`, and only admins can change them afterwards.
- **Casino**: Blackjack (`bj*`; 2-deck shoes, streak bonuses 5:+2,500 · 6:+5,000 · 7–9:+15,000 · 10+:+50,000 at any bet,
  0.5 s cooldown between deals), Roulette (`rl*` — note `rl` prefix is ALSO used for live Russian Roulette lobby code),
  Craps (`cr*`), High-Low (`hl*`), Flappy Cheese (10 BB/pipe, 5k/day cap; Vector card gives one 10× uncapped run/day),
  Revenge rat hunt (`revengeStart`), mining (25 BB/min while the app is on screen).
- **Russian Roulette**: solo vs bots and live 4-seat animal bar (three.js scene, `rr*`/`rl*`), drinking/blackout,
  shoot-someone + return fire, winner gets 4× final bet.
- **Texas Hold'em** (`th*`): live open cash table, same bar scene, server-hosted.
- **Cards**: collections League Moments (`lm`), Multiverse (`mv`), Platinum Mysterio (`pm`, limited, ended Oct 23 2026).
  Rarities `CR` 0 Common … 6 Dragon, 7 Platinum, 8 Platinum Mysterio Legendary.
  Mint limits `CR_LIM=[∞,1000,100,10,5,3,1,15,1]`. Packs: Common 5k, Uncommon 10k, Rare 25k, Super Rare 50k,
  Elite 100k, Grail 250k, Dragon 765,432 (odds in `pkPullTier/pkSlot/pkChance` — don't change).
  Quick-sell `QS_VAL=[300,900,3000,12000,36000,90000,1000000,5000,0]`.
  Daily dividend at 1 AM ET (`divCheck`): `CARD_DIV=[1,5,25,200,1000,5000,50000,250,0]` per copy; full rarity set in a
  collection 2×; owning every copy of a card another 2× (max 4×; not Dragon, not Commons, not Platinum).
  Legendary abilities: Evil Witch "Debby" steals 10k/day from a random player (bank "Via Debby"), Peter Griffin
  multiplies your whole dividend 1.5× per copy (cap 3×), Claire can be burned for 500k (gone forever).
  Dragon owners get an iridescent profile glow. Platinum pack fees (1.5k dev → owner, 1.5k creator → Zartog) are paid by "the house".
- **Market**: list for price and/or trade wants (specific card or "rarity or better"), private listings (`only`).
- **Offers** (`of*`): BB and/or cards on any open listing. Offered cards leave the offerer's prefs while pending
  (`esc`) and come back on decline/cancel/expiry (48 h)/failure (`returned`, offerer's page). Accept = status race on the
  offer, then the listing is claimed like `mkBuy` (`status` sold/traded, `buyer`, `price` = offered BB so `cardMoney` counts it
  once, `offerId`), then `ofDone`; seller picks up cards via `mkClaim` (gotCids), buyer via `ofClaimBuy` (`bClaimed`).
  Seller can counter (new offer seller→offerer, `ctr`). Every step is posted in the pair's DM thread.
  **Direct offers** (`direct:true`, `listingId:null`): tap a card in someone else's collection/profile (`data-cardwho`) →
  "Make offer" (`ofDirHtml`, `ofCompose(null,null,{cid,to})`). The card stays with the owner until accept; the owner's accept
  re-reads their prefs (fails cleanly → escrow returns if the card is gone), takes the card out, and writes `market/of_<offerId>`
  (same shape as an accepted listing offer: `status` sold/traded, `price`=BB, `ofDone`), then the normal `mkClaim`/`ofClaimBuy`.
  A direct counter holds the owner's card on the offer (`sEsc`; returned via `ofReturns`, `sReturned`). Owner sees them under
  "Offers on your cards" on the Marketplace.
- **DMs** (`dm*`): League | Direct switch in the chat panel; inbox, threads, unread (`un`/`read` on the thread doc),
  DM banner. Listens to my thread list + the open thread's newest 50 only.
- **Showcase** (`sc*`): `prefs.showcase` = up to 3 card ids, shown on top of the collection and on the profile; unowned cards hide.
- **Bank** (`bk*`): transfers; loans with optional collateral (seizure all-at-once or one card per interval),
  auto-collection ONLY on payment dates (takes all you have if short), pay in chunks anytime, early payoff =
  principal + interest accrued so far (loan rate & compounding, payments stop accruing when made), capped at the rest of the schedule, never below what is overdue.
- **Presence**: "● N online" pill, green avatar rings — from existing prefs stamps (no extra writes).
- **Admin tab**: invite codes, data import, card tools, previews.

## Live multiplayer (server host)
`config/mp.serverHost = true` → Cloud Functions host Russian Roulette + Hold'em: clients write inputs
(`rrin/{id}`, `thin/{id}`, `mpreq/{id}`, `mptick/{id}`), the server runs the game in Firestore transactions and
appends events to the table doc; hole cards/deck secrets live in `thhole`/`mpsecret` (rules restrict reads).
If the server's heartbeat (`config/mp.beat`) goes stale, clients fall back to the old phone-host mode automatically.
Switch on/off: GitHub Actions → "Live tables on the server (switch)". Buy-ins/payouts are still applied by each
player's own client to prefs (`rrNet`/`thNet`).

## Scheduled jobs (GitHub Actions, `tools/jobs`)
- `job-scoreboard.yml` hourly at :46 — Sleeper live scores/projections → fair moneylines → `meta/scoreboard`;
  then (separate step, runs even if the fantasy step exits early) `nfl.py` → `meta/nfl` lines + `nfl/{season}_{week}` results.
  Tests: `cd tools/jobs && python3 -m unittest test_nfl`.
- `job-futures.yml` Tuesdays 2:45 AM ET — playoff/title odds simulation → `meta/futures`.
- `job-grade.yml` manual — grades finished games from Sleeper.
- `job-mpflag.yml` manual — live-tables server switch.
All use the `FIREBASE_SERVICE_ACCOUNT` repo secret.

## Testing
- Firebase emulator suite (auth, firestore, functions, hosting): `npx firebase-tools emulators:start --project
  biggiecheesesportsbook --only auth,firestore,functions,hosting` from the repo; open `http://localhost:5000/?emu`
  (the `?emu` flag points the shim at the emulators and exposes `SB_DEV_SIGNIN(email)`).
- Seed with an export: `tools/migrate/import.js` (see README). Real exports contain personal data — never commit them.
- Playwright (chromium) for UI checks; emulate iPhone 390×844 / 375×667, and simulate safe-area insets
  (iOS home-screen apps installed before Oct 21 still use the translucent status bar).
- `cd functions && npm test` for the game engines.
- Things to always re-verify after money-related edits: balance before/after, reload mid-action, two clients.

## Phone / iOS gotchas
- Everything top/bottom-anchored must respect `env(safe-area-inset-top/bottom)`.
- Chat sizing uses `visualViewport`; don't reintroduce `window.scrollTo(0,0)` hacks.
- Inputs need font-size ≥16px (iOS zoom). Global key handlers must ignore typing in inputs (`keyInField(e)`).
- Icons are cache-busted with `?v=N` — bump N when replacing icons.

## Workflow conventions
- Small focused commits; message explains the user-visible change.
- Before pushing: syntax check + `sync-shared --check`; after pushing, confirm the Actions run is green
  (`gh api repos/s4mt1mms-cyber/BiggieCheese-s-Sportsbook-Casino/actions/runs?per_page=1`).
- Coordinate with the owner before risky changes; if two people work at once, use branches/PRs to avoid collisions.
