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
| `market` | card listings/trades. `bank` | BB transfers + fees + curse tithes (`kind:"tithe"`). `loans` | player loans (+ Heart of Finance House loans, `lender:"house"`). |
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

## Card System V2 (Oct 29, owner's "Card System Overhaul" dev brief) — CURRENT, read this before touching cards
Everything below about rarity packs, print runs/supply, crafting, quick-selling pool cards and trading pool cards is HISTORY for Multiverse /
Fantasyland / ChudBootyCheeks. League Moments (`lm`) still works the old way (its own rarity packs, supply, quick-sell, market). Platinum Mysterio cards are kept as they were (owner Oct 29: not credited, still trade/quick-sell; no new packs).
- **Pool** `POOL=["mv","fl","cb"]`, `inPool(id)`, `v2Pool()` (cards by rarity; the curse separate). `cardOld(k)` = pool card (doesn't trade, was credited).
- **One pack** `V2_PACK` (5 cards, 10,000 BB since Oct 29 1:37 AM (owner; brief said 2,500), Vail discount via `v2Price`), `v2Buy`/`v2Buy1`/`v2Open`: each card rolls `V2_ODDS` (+ `V2_CURSE` 0.1%) then a
  uniform card of that rarity; reads the SAVED prefs first. Not owned → key added at LV 1; owned → +1 shard `prefs.shards{r:n}` (curse dupes: no shard).
  `prefs.v2pity` cards since the last Dragon, `V2_PITY` 35,000 forces one. `prefs.freeV2` free packs (Paradise every N packs `paraN`, Rotunda
  floor(odds/2 × level mult)). Lunch? and the curse trigger on EVERY pull (dupes too); Dragon bounty only for a new Dragon. Pull log `pulls` (pack "v2").
- **Levels**: one key per card (`id` or `id@L`), `LV_MAX=[13,11,9,7,5,3,1]`, `craftable` = pool & not curse. Upgrade `v2Up` (card view, `v2UpHtml`):
  L shards + `TIER_UP[L+1+2r]` BB, one prefs write (old key 0, new key 1, shards, `craftSpent`, `craftLog{c,f,t,fee,n,sh}`). Shard store `v2ShBuy`
  (`SHARD_PRICE`, burned via craftSpent, craftLog `{sh,n,fee,buy:1}`). Dividend `v2Div`: `TIER_DIV[lv+2r-1]`, Dragon 3,000, `V2_X3` Joe Camel/Debbie 3×,
  curse 0; no full-set bonus for pool cards (LM keeps it). Crafting tab removed (`viewCraft` redirects to the collection).
- **Abilities** `AB2` rewritten (brief Appendix B, `v[level-1]`, C–SR off at LV 1 via `abOff`); code abilities by level `ABV` + `abLv`/`abV`
  (dean edge → `crResolve(...,edge)`, hof amount `hofT`, slop `slopN`, shrex, hilo, bers `bersN`, lunch [pct,cap], social). Tiered helpers
  `hlUwsX`, `chrisSh` (Chris steals SHARDS: steals doc {sh,n}, victim's page takes what's there, thief's page reverts the rest), crab `wheelCrab`/`wheelWin`
  (n spins every 24/n h), summer `RL_SUMMER`, crndd 20+5L% / 45+5L%. Vector boost checks any level (`fpHasBoost`).
- **Trading**: pool cards can't be listed/offered/traded/collateral (`tradeCards`, guards in mkList/mkBuy/ofMake/ofDirHtml/pickers). Shards trade:
  market docs `{cid:"sh-<r>",shard:r,qty,price}` (`isShL`, `shList`/`shBuy`/`shCancel`, `v2MktHtml`); money via `cardMoney` like any sale (5% burned).
- **Switchover** (`cv2Run`/`cv2One`/`cv2Patch`/`cv2Items`/`cv2Strip`, gate `#cv2Ov`, popup `cv2Pop`): per player once: every pool card anywhere
  (prefs, open listings, unclaimed trades, offer escrow, loan collateral/requests) credited at 3× `qsOld` (the pre-switch quick-sell), prefs keys → 0,
  `prefs.cv2{v,at,amt,n,docs,vd}`, then `bank/cv2_<id>` {from:"house",kind:"cv2"}, then those docs stripped (`vd`). Own page or the admin page for offline players.
- **Loans** (all, incl. Heart of Finance): one at a time as borrower (`bkHasLoan`), payoff locked = rest of the schedule (`bkPayoffNow`), and `bkSweep`
  (borrower's page, 15 s) pays every balance rise above the low-water mark (`BK_SW`, `swBase` on the loan) to the loan (payments `sweep:true`).
- **Slots**: per-reel strips `SL_WR` (every winning combo ≈2.5% more often, lines 96.35%), jackpot 1% of all-time `slWag` + 0.5% (`SL_JP_ADD`) of `slWag2`
  (wagers since Oct 29) = 1.5% going forward; `node tools/test/slots.test.mjs`.
- Shard crystals (owner Oct 29): `shardSvg(r,px,cls)` / `SH_ART` (Common light-blue hexagon, Uncommon green pentagon, Rare dark-blue octagon,
  SR purple cracked orb, Elite red 4-point star, Grail yellow trillion, Dragon pink burst; `live` = idle motion per rarity). Duplicate pulls show three
  crystals popping out of the card (`.shfx`, `shPop`). Rules: `freshWrite()` also requires the `v3.` wv prefix (pre-V2 tabs can't write).
- Collection tabs (owner Oct 29): League Moments · Platinum Mysterio · Multiverse (`cset` "v2" = the whole pool, default); labels `CNM` in viewPacks.
- Upgrade glow (owner Oct 29): `lvGlow(c)` on pool cards with max > 1: (lv−1)/(max−1) ≥ .5 silver `lvg-s`, ≥ .75 gold `lvg-g`, max neon red `lvg-m` + red MAX badge `.lvb.mxr`.
  Collection sorts higher levels first within a rarity. Pack opening reads the live prefs copy (no server read first); upgrade animation 3 hits.
- **Shop** (side menu, tab `shop`, same viewPacks): sub-tabs Packs · Shards (`v2ShardShopHtml`, one card-sized box per rarity, bulk `S.pk.shq` 1/2/3/5/10) ·
  Marketplace (`trMktHtml`). Card Collections (tab `packs`) is the collection only; active cards list sits under it.
- **Trades** (Oct 29, replaced the old market for new deals; old listings/offers still settle and show under "Older listings"): `trades/{id}`, see the
  comment above `trMake`. Offers to a player (exact keys) or listings (want cards = ids, any level) for any mix of BB/shards/cards; maker's give escrowed
  (prefs `trDone[id]` e/t/f/r markers, BB to the house via bank `trE_`), taker's page `trAccept` (status race, one prefs write, bank `trT_/trW_/trW2_`, 5% of
  BB received burned), maker's page `trTick` claims/returns/expires. Receiving a pool card you already have: keep the higher level, the other → shards = its level.
- **Card Guidebook** (tab `guide`, `viewGuide`): every card, census of owners, "Ability:" (red) + per-level text.
- **Upgrade shards** tiered `V2_SH=[1,3,4,7,11,18,29,40,52,65,80,100]` (LV L→L+1 = V2_SH[L-1]); one-time reset `uprRun` (prefs.upr): upgraded pool cards → LV 1,
  shards refunded at the old 1-per-level cost (L·(L−1)/2), BB not refunded.
- Tests: scratch `dmr/trtest.cjs` (trades reconcile to the BB), `dmr/cv2test.cjs` (old app vs new app: every offline player's balance moves by exactly the expected credit).

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
- **NBA bets** (`nba*`, Oct 23, side menu Sports betting → NBA bets): the NFL module copied by scratch `nba/gen.py` (identifiers nfl→nba; CSS classes shared).
  `tools/jobs/nba.py` (hourly, after nfl.py; imports its pricing/grading): ESPN predictor (BPI) → else posted spread (sd 12) → else no lines; totals = feed O/U.
  `meta/nba` = today's + tomorrow's games (each row has its own `wk` = ET date YYYYMMDD); results `nba/{YYYYMMDD}.g[espnId]`, void if not final by the end of
  the day after. gameId `nba:{YYYYMMDD}:{espnId}:{ml|sp|tot}`, parlays `nba:true`; `nbaGame` sets `nfl:true, lg:"NBA"` so shared grading/titles work.
  Rules: the NFL kickoff lock covers `nba:` ids too (`nflId`, `docPath(p[0],…)`), `nba` is admin-only. Tests: `python3 -m unittest test_nba`.
- **NHL bets** (`nhl*`, Oct 24, side menu Sports betting → NHL bets): the NBA module copied by scratch `nhl/gen.py` (nba→nhl) with per-side puck-line prices
  (`spread.price` = {home,away}; the quote reads either shape). `tools/jobs/nhl.py` (hourly, after nba.py): ESPN predictor → else posted moneylines de-vigged → else no lines;
  puck line ±1.5 for the favorite priced from a Poisson goal model (`rates`/`puck_line`, EN = empty-net share) at the same EDGE; totals = feed O/U −110.
  `meta/nhl`, results `nhl/{YYYYMMDD}`, gameId `nhl:{YYYYMMDD}:{espnId}:{ml|sp|tot}`, parlays `nhl:true`; rules: `nhl` admin-only, kickoff lock covers `nhl:`. Tests: `python3 -m unittest test_nhl`.
- **Bet results popup** (Oct 24): `betPayPopup` (after each render, like `recapPopup`) lists every settled sports bet of mine not in `prefs.bsn` {key:1} (+ localStorage `sab-bsn`), built from `weekRecaps` items (now carry `id`, `at`, graded `legs`); first run (`bsnInit`) treats bets older than 3 days as seen; the weekly recap's OK marks its bets too. Payout lines (`poItemHtml`/`legHtml`): pick green/red, parlay legs ✓/✗ green/red.
- **Casino**: Blackjack (`bj*`; 2-deck shoes, streak bonus = `bjStreakBB(n)`: a flat 1,000 BB every 5 wins in a row (5, 10, 15 …), no deal cooldown), Roulette (`rl*` — note `rl` prefix is ALSO used for live Russian Roulette lobby code),
  Craps (`cr*`), High-Low (`hl*`), Flappy Cheese = Cheese Farm (`fp*`: Press `FP_PRESS` 1/10/30/100/250/500 BB per pipe, Silo `FP_SILO` 5k…500k daily cap (every daily reset — dividends, Debby, King Slop, farm cap, Vector run — uses `divDay()` = the 12:01 AM ET day (was 1 AM until Oct 24 11 PM); `divLeft()` = ms to the next reset); levels
  `prefs.fpPress/fpSilo`, upgrade spend `prefs.farmSpent` in the ledger; Vector card gives one boosted run/day: since Oct 25 `FP_BOOST_MULT` 5× per pipe, capped at `fpCap()` (full Silo) per run, and fills the Silo by half the uncapped run value `raw` (so a run worth 2× the Silo fills it), never past the cap),
  Revenge rat hunt (`revengeStart`), mining (25 BB/min — OFF since Oct 23: `MINE_ON=false` only stamps `mineAt` for presence).
- **Russian Roulette**: solo vs bots and live 4-seat animal bar (three.js scene, `rr*`/`rl*`), drinking/blackout,
  shoot-someone + return fire, winner gets 4× final bet.
- **Texas Hold'em** (`th*`): live open cash table, same bar scene, server-hosted. House rake (Oct 23): `thRake` (TH_PURE) takes `TH_RAKE` 5% of every pot that saw a flop, uncalled bets excluded; `H.rk` this hand, `H.rkT` game total (both engines; tests count it in chip conservation).
- **Cards**: collections League Moments (`lm`), Multiverse (`mv`), Platinum Mysterio (`pm`, limited, ended Oct 23 2026).
  Rarities `CR` 0 Common … 6 Dragon, 7 Platinum, 8 Platinum Mysterio Legendary.
  Mint limits `CR_LIM=[∞,1000,100,10,5,3,1,15,1]`. Since Oct 25 every Super Rare gets +`SR_EXTRA` 2 on top (in `cardsCat`; MV/LM 12, FL 9; not the curse). Packs: Common 5k, Uncommon 10k, Rare 25k, Super Rare 50k,
  Elite 100k, Grail 250k, Dragon 765,432 (odds in `pkPullTier/pkSlot/pkChance` — don't change).
  Owner's Oct 22 odds change: Elite/Grail weights ≥5 cut (≤10 → 5, >10 → −5; removed weight moved to Common): Grail pack Elite 16.1 / Grail 5,
  Dragon pack Elite 16 / Grail 5 (+ its slot-3 Elite 10 → 5, to Rare). Dragons and anything under 5% unchanged.
  Quick-sell `QS_VAL=[300,900,3000,12000,36000,90000,1000000,5000,0]`.
  Daily dividend at 1 AM ET (`divCheck`): `CARD_DIV=[1,5,25,200,1000,5000,100000,250,0]` (Dragon 100k since Oct 22) per copy; full rarity set in a
  collection 2×; owning every copy of a card another 2× (max 4×; not Dragon, not Commons, not Platinum).
  Legendary abilities: Evil Witch "Debby" steals 10k/day from a random player (bank "Via Debby"), Peter Griffin
  multiplies your whole dividend 1.5× per copy (cap 3×), Claire can be burned for 500k (gone forever).
  Dragon bounty: each Dragon pulled (and kept) from a pack → one `bank/bounty_<me>_<at>_<k>` doc `{kind:"bounty",to,pay:{id:amt},amt}`:
  every other player (`tiRecips`) pays `DRAGON_BOUNTY` (20,000, capped at their balance); the ledger and Bank history read `pay`.
  Dragon owners get an iridescent profile glow. Platinum pack fees (1.5k dev → owner, 1.5k creator → Zartog) are paid by "the house".
  Supply: `pkLeft(set)` = copies left per rarity (shop shows "Copies left"); `pkBlocked(p,set)` disables a pack once a guaranteed
  slot has nothing left at/above its floor (odds never change: a slot that rolls a sold-out rarity still pulls a card of it, flagged `pulls.over[i]`; it's not added to
  the collection and auto-sells at `qsVal` into `prefs.quickSold` in the same pack write, shown as "MAX SUPPLY · Auto-sold"). Exception: Dragons never over-pull; a Dragon roll with every Dragon already owned drops to the best lower rarity with copies left.
  Pack commissions (`PACK_FEES`/`pkFees`, paid by the house, never to yourself): owner 7.5% of every pack price (Zartog's 5%
  Multiverse fee ended Oct 22; he got a one-time 50,000 instead, `ZB_ONCE`/`zbOnce`, bank doc `devfee_zartog_once`) — one `bank/packfee_<buyer>_<to>_<day>_<k>` doc per buyer/recipient/day holding the running total.
  `divCalc(id)` = the dividend math (used by `divCheck` and the collection header `colSumHtml`, which also shows total quick-sell value).
- **Multiverse expansion cards (code-defined)**: the original Multiverse cards live in `meta/cards_mv` (+ images in `cardimg/`,
  made with the Admin card tools). The expansion cards are defined in code in `MV_ADD` (index.html) and merged into the catalog by
  `cardsCat("mv")` (`mvMerge`); ids are `mv-<slug>`, art is static WebP at `public/cards/mv/<slug>.webp` (620 px wide, ~50–150 KB;
  no Firestore read; `/cards/**` is cached a week, so bump `MV_IMGV` when REPLACING a file). Nothing to do in production at launch:
  deploying makes them part of Multiverse packs. Pack odds are untouched; a new card just joins its rarity's pool, mint limits per `CR_LIM`.
  **Add a card later:** one row `[slug, rarity, "Title", {opts}]` in `MV_ADD` + the WebP file. `img:false` = no art yet → a placeholder
  face (`cardPh`: rarity colors, name, "Art coming soon"; an Admin "Add image" upload to `cardimg/<id>` also fills it, no deploy);
  to add art later drop in the WebP and delete `img:false`. `abil:"<key>"` attaches an ability (`CARD_ABIL`, shown on the card back
  by `abHtml` as "Ability · name"); `div:N` overrides the daily dividend per copy (`cardDiv`, used inside `divCalc`, so the collection header and the 1 AM payout agree; the curse card is skipped there too). Blur bystanders' faces in new art.
  Abilities (`hasAb(key,id)`; extra copies never stack):
  - `curse` **Jimmy Scroggins Rookie** (Super Rare). Only 3 copies (`lim:3`) and 85% less likely than other Super Rares in a pack (`pw:.15`, `pkPick`). Pull: 10% of the puller's balance (floor) per copy, split in whole BB among all
    other players (`tiRecips`: everyone else with a team), remainder vanishes; bank doc `{kind:"tithe",src:"pull",from,tos,each,amt}`;
    "THANK YOU FOR TITHING" popup when the card flips. While held: 10% of every win (BJ hand net + streak bonus, roulette spin net,
    craps roll net, High-Low cash-out profit, RR/Hold'em profit, sports-bet wins, dividends, mining, Flappy, rat hunt, Debby) —
    each win site calls `tiAdd(patch, profit)`, which adds to `prefs.tiWin` in the SAME write as the winnings field (tiWin is in
    `LV_LAZY`, so it batches with its partner). Ledger: `balOf` − floor(tiWin/10) at once. Settlement (`tiSettle`, every 20 s, at most
    every 3 min unless ≥2,000 owed, only from the server-confirmed tiWin `TI.conf`): one bank doc `ti_<me>_<paidSoFar>`
    `{kind:"tithe",src:"win",tos,each,amt=each·n}`; recipients get `each` once; "win" docs are NOT taken from the payer again.
    Sports bets: `prefs.tiSb` = won bet ids seen since the curse started (`tiSbCheck`, uses `ledger().wins`). Not winnings: transfers,
    loans, market/offer sales, quick-sells. No dividend, no full-set credit, can't be quick-sold (`qsVal` 0); can be sold/traded;
    "Remove curse" (`tiUncurse`) costs 5,000 (`prefs.curseFee`, in the ledger) and burns one copy (back into the packs).
  - `dean` **Craps Dean Strow** (Elite): craps payouts × `crDeanF(bet, n)` so every bet type's EV is +1.85% (`CR_EDGE`; winnings round up) (math in the comment
    above `crDeanF`; `crResolve(..., dean)`).
  - `hof` **Heart of Finance** (Elite): Bank → "Borrow 10,000 BB" (`hofTake`): a normal `loans` doc with `lender:"house"`, `hof:true`,
    5%/day, 1 payment of 10,500 after 24 h, gradual mode (late, default 7 days after due); auto-collected by the borrower's page like any
    loan. One at a time; after a default the House won't lend again. Selling the card doesn't touch an open loan.
  - `slop` **King Slop** (Grail): 3 roulette respins a day (`SLOP_DAY`) (`prefs.slopDay`/`slopUsed`, `divDay` boundary). After a losing spin,
    "Respin (n left)" voids it: the same write takes the voided net back out of rlNet and adds the new spin's (`rlRespinNet`), no
    extra rlSpins; the new result is final (respin again only while respins remain).
  - `shrex` **Shrex** (Grail): a natural blackjack pays 3× the bet (return 4×, in `bjSettle`; was streak ×1.5 until Oct 22) and a green "swamp" glow on avatars/profile pictures (`.swamp`, replaces the Dragon glow).
  - `social` **Diverse Family** (Rare, art pending): pulling it posts "<name> +10 million social credit score!" in league chat. No money.
  - `hilo` **The Grail · Daddy Christian** (Grail, `mv-art-63` in meta/cards_mv; the ability is attached in code by `MV_ABIL` in `mvMerge`):
    High-Low guesses after 4 right in a row (`st.n`, run counter, in `hlSnap`) are priced at `HL_CHR_EDGE` 1.02/p instead of 0.97/p (`hlMultX`).
  - `div:6999` **Joe Camel** (Elite, art pending).
  Tests: `node tools/test/mv-abilities.test.mjs` (craps factors exact + Monte Carlo through `crResolve`, tithe split math, respin math).
- **Fantasyland** (released Oct 23: `FL_OPEN=true`; false = admin-only) (`fl`, Oct 23, replaced the empty "Based PBA Moments" slot): code-defined like MV_ADD — `FL_ADD` rows, `flCards()`, art
  `public/cards/fl/<slug>.webp` (`FL_IMGV`), ids `fl-<slug>`. Owner's print runs `FL_LIM` [∞,100,25,7,3,2] via `limF` (overrides CR_LIM). No Dragons,
  so `pkBlocked` blocks the Dragon pack there. Rainbow theme: `.setcard.rainbow`, `.tcard.tfull.flc` animated rainbow frame, LOGO.fl. Card auras on Grails
  (`fx`+`cfx`, rendered by pmFxHtml/pmOverHtml): `zap` = Peter's lightning (The Gooner), `emo` = floating emoji `c.emo` (Vail Grail 🦶, BiggieCheese Rookie 🧀).
  `bers` **Berserker** (Elite): AUTO KILL button in the rat hunt (`revengeStart`, `#revAuto`), 3/day (`BERS_DAY`, `prefs.bersDay/bersUsed`, divDay), a normal 1,000 kill.
  Placeholders (`img:false`): supply-drop, rocktopus, forbidden-archive, average-cowboys-fan, minion-commander, legendary-crew, another-day (owner's art not usable:
  copyrighted characters / slur title). Faces of bystanders blurred in honors-class-clown, autism-attack; mirror reflection in squeaky-clean.
- **ChudBootyCheeks (`cb`, Oct 26, owner's Card_Expansion.xlsx):** code-defined like Fantasyland: `CB_ADD`, `cbCards()`, art `public/cards/cb/<slug>.webp` (`CB_IMGV`), print runs `CB_LIM` [∞,100,25,7,3,2,1] (+SR_EXTRA), open to all (`setOpen`), poop-brown frame `.cbc`, `.setcard.poop`, porta-potty `LOGO.cb`. Owner Oct 26: parody art with copyrighted characters (Batman, Lightning McQueen) is OK for this private app — don't flag it. Placeholders (`img:false`): United We Sit, Rage Baiter, Ball Knowledge Required, Rotunda Rumble Disaster, Beowulf Wages (Dragon). Faces blurred: Chad Baby (mv), Light Bearers, Tasting Flight.
  Abilities (AB2, LV2+ for Common–SR): `unitedsit` (`hlUws`, High-Low end-card ×), `ballk` (NBA bets via `bxOf(P,true)`), `floof` (High-Low same-rank loss refund), `newfriend` (Bank box, House → chosen player, bank `nf_<me>_<day>`), `gun`/`bigscreen` (`slRet`), `cody` (Flappy pipes past N skip the cap: `ext`), `chris` (steal a LV1 card: `steals/<me>_<day>`, victim's page removes it via `stealProc`, failed → thief's page reverts), `crab` (2nd wheel spin `wheel_<me>_<slot>_b`), `giga` (+% in `abWin` while `bjViewers(S.tab)`), `caleb` (bust refund in `bjSettle`), `rotunda` (`cbAuto`: won bets ≥+200 → `prefs.freePk{packId:n}`, used by `pkFreeN`; odds from `ledger().wr`), `summer` (roulette red/black refunded on 0), `btc` (`cbAuto`: balance <1 → 10,000 once a day, bank `btc_<me>_<day>`), `chad` (mv, +5% on 1st-12 wins), `swole` (fl Swole Jesus, +v% per 20 pipes). Code ability `lunch` (Lunch?): pulling it isn't kept (`pulls.lunchI`), takes `LUNCH_PCT` 10% (max `LUNCH_CAP` 50k) of every richer player → bank `lunch_<me>_<at>` {kind:"lunch",pay} (ledger + bkActivity like bounty). The High School Shitter (id `cb-high-school-drip`, was "High School Drip") pull → `slimeShow(cardRect)`: slime bursts out of the card, "U JUST GOT SHIT ON", full-screen slime, swipe 80% off. Admin "🧪 Test pack" in the cb shop (`cbTestPack`, free, nothing saved).
- **BiggieTown (Oct 28, owner; first called Biggie Gulch, then Biggietown):** first-person free-roam western town, `public/js/western.js` (loaded on first open by `wwOpen()`, side menu Multiplayer games → Biggietown; bridge `window.WWAPI` in index.html: three.js loader `rrLoad`, `rrChairParts`, names, `prefs.wwBest` {t ms, at}). No money, no bots yet (owner: town first, PvP later). **Released to everyone Oct 28** (NEWS v144; menu button always shown; server access = `config/ww.open` true, set by job-fix `wwopen`). Full-screen overlay `#wwOv` (z 2147483000), the only exit is Pause → Exit (Esc / pointer-lock loss / tab hide / Android back = pause); phones held upright get the whole game rotated 90° (`#wwRot`, `gpt()` maps touches). Town: buildings from `building()` (local front z=0, north side rot 0 at z −9.6, south rot π at +9.6), two enterable saloons (`enter:1`, `saloonInside`, batwing doors `G.doors`), church bell, bottle challenge behind the livery (gong → 12 bottles, timer, best-time board `drawLB`). Colliders = world AABBs `G.cols` (≤0.45 tall = steps). Spawns `SPAWNS` + `pickSpawn(others)` (≥15 m from and out of sight of everyone, farthest + random, never the same twice). Ladders (`o.ladder` ±1 = side, back wall) → `G.ladders` zones; hold forward to climb, roofs are walkable (saloon ceiling slab is solid). Static meshes merged per material by `batch()`; revolver drawn in its own scene `G.vs` (no wall clipping). Main menu: Join game (`G.server.up`, stub `joinGame` until PvP) · Free roam · Settings · Stats (this session `G.ses` / all time `prefs.wwStats` + unsaved `G.sesD`, saved by `saveStats` on pause/menu/exit/every 60 s). HUD: kill feed top-left (`killFeed`, max 4 lines, 6.5 s), live count + session BB chip top-right (`setLive`/`setBB`, `sesAdd("bb",…)`), pause top-right. Controls (Settings → Controls): computer = rebind every action (`ACTS`, `G.set.keys` action → key code or `MouseN`, `actOf`, capture `G.capturing`/`bindTo` swaps duplicates; arrows + Esc always work); phone = drag buttons (`showLayout`, `G.set.pos` {fire|aim|reload|jump: [fx,fy]}), button size, left-handed mirror, hold-to-aim. **PvP (Oct 28):** live match server `server/` (Node 24 — Cloud Build has no Node 20, `ws`, firebase-admin) on Cloud Run service `biggietown` (us-central1, ONE instance: matches live in its memory; deploy = `.github/workflows/deploy-biggietown.yml` on pushes to server/**; URL `https://biggietown-302676867929.us-central1.run.app`, `/status`, WebSocket). Server decides hits (lag-compensated rewind ≤250 ms, walls from `server/map.json` = the client's `G.cols` exported via the emulator), ONE hitbox for all (`HB` cylinder r .42 + head sphere r .25 at 1.68 m, a little bigger than the models (owner Oct 28); clients scale every model so the top of its bounds is 1.93 = top of the head ball (`fitModel`, re-measured a few times as skins load); snapshot entries carry hp → HP bar in every name tag (`.wwthp`); regen after 7 s at ~6 HP/s; FFA death = Respawn button (pointer unlocked, server `{t:"respawn"}` after 3 s, 20 s backstop); per-frame collision checks use a 4 m collider grid (`gridAdd`/`nearCols`, wagons re-inserted on move)), kills (owner Oct 28, 2nd rule set: each kill adds the KILLER'S own buy-in `k.tier` to their stack from the house, victims lose nothing to the killer; dying/leaving pays out floor(stack/2); 1 kill = break even; a server restart (SIGTERM) still pays the full stack), NO cash-out (owner Oct 28: the run only ends when you die; the `cash` message is ignored); leaving = dying (`how:"quit"`): within 10 s of being hit the last attacker gets the kill, otherwise after a 10 s reconnect window it counts as a death with no killer (keep half with 1+ kills, the take is gone). SIGTERM still pays stacks out. Money: page writes `bank/wwin_<me>_<at>` {kind:"wwbuy",from:me,to:"house",amt 100–10,000 (slider, owner Oct 28; one shared town `ROOM`, `p.tier` = that player's buy-in),used:false} (`WWAPI.buyIn`), server marks it used and writes ONE `bank/wwout_<buyId>` {kind:"wwout",from:"house",to,amt=stack}; unused buy-ins refunded after 3 min; rules (`wwBankOk`) stop players editing buy-ins or writing payouts. Access: owner/admins (`config/admins`) or `config/ww.open==true`. **Buy-in shootout closed to players (owner Oct 28, to rework later):** only admins see the button (`WWAPI.admin`), `buyIn` refuses non-admins, the server refuses non-admin buy-in joins (`c.admin`). Phone aim assist (Oct 28, `aimAssist`, Settings `aa`, touch + PvP only): enemy you can see within 4.5° (3.2° aimed, 1.2° scoped) → look sensitivity ×.65 and, while turning/moving, a gentle pull toward the chest (no snap, LOS-checked every 150 ms, not on spawn-protected players). FFA scoreboard `.wwsb` (top 5 + you; `.wwlb` is the bottle board). Perf (Oct 28, later): **light graphics by default** (`G.set.hiGfx` false → `G.hi`): no antialias, pixel ratio 1 (phones 1.25), no shadows, Lambert materials via `wmat()`; ~60 fps cap in `loop` (skip frames <12.5 ms apart, so 144 Hz screens get ~72 not 48; menus/pause ~20 fps); dynamic resolution in light mode (`G.dres`: pixel ratio steps down to .55 when frames average >25 ms, back up below 19 ms — the old 20 ms threshold + 15.5 ms cap made 144 Hz screens drop resolution forever); camera far 470 in light mode (sky dome scaled .55 to stay inside it); light mode also: computer pixel ratio .9, opaque window glass, static meshes `matrixAutoUpdate=false` after `batch()`, remotes update only their own root matrices (no whole-scene `updateMatrixWorld` per frame), HUD lookups cached (`hq()`), class toggles only on change, no backdrop blur behind menus; Settings "High graphics" restores the old look (takes effect on next open); "Show FPS and ping" overlay `#wwFps`. Earlier: computer pixel ratio ≤1.25, PCF shadows redrawn every 3rd frame (`shadowMap.autoUpdate=false`), no interior/explosion point lights. Respawns take you out of the car (`ffaRespawn` → `carOut`; client exits too) — fixed drivers looking stuck in the car after a new match. **Free for all (Oct 28):** the main server forks a second copy of `server/index.js` (MODE=ffa, port 8081, its own town) and proxies `/ffa` WebSockets to it (`srv.on("upgrade")`); `/status` has `ffa` {up,n,end} from the child's IPC. FFA: no buy-in, 5-minute matches (`M`, `ffaStart/ffaFinish`, 10 s gap), respawn 3 s after death (`ffaRespawn`, client `G.dead` + `{t:"respawn"}`), kill 100 pts / headshot kill 150, top scorer (ties: headshots, then who joined first) gets `bank/wwffa_<matchId>` {kind:"wwffa",from:"house",amt:1000} only if 2+ players were in that match; rules block players writing wwffa. Client: Join game → `showModes` (Free for all / Buy-in shootout), `joinFfa`, `netOpen(mode)`, HUD chip = points + clock + leader (`ffaChip`), end board `ffaEnd` (both list every player), live scoreboard `#wwLb` on the right. Jumping stands you up from a crouch (`G.crSup` ignores a held crouch key until released). Mantle also from the ground (jump at a ledge 1.15–2 m high) and by holding jump in the air. Emotes: owned `prefs.emotes`, `{t:"emo"}` relayed (8 s cooldown); remote characters = equipped skin via `rrAnimal` + `emApply` (standing pose `poseFor`, emote poses with rise forced to 1); your own emote swings the camera behind you. If map geometry changes, re-export `server/map.json`. (door colliders `c.dr` are excluded). Oct 28 later: windows = one InstancedMesh `G.winMesh` (`G.wins[i].box`), one shot → `breakGlass` (relay `glass` {s:2}; `crackGlass` only for old s:1 messages); every pane has a collider while intact (`gw`, fake `dr.open` = broken, so map export skips it) and every building is a hollow shell: `holes()` cuts real window/door openings out of the front walls (church side walls too), so a broken window is a hole you can shoot through. Walk-in buildings (`door:1` + interior fn, single hinged door): General Store, Bank, Sheriff, Barber, Undertaker, Jail. Mantle: in the air at a ledge ≤2 m above your feet, jump again (`tryMantle`, `G.mantle`). Wagons `G.wagons` are pushable (`pushWagons`/`setWagon`, relay `wagon`, server `WAGONS` from map.json `wagons` block bullets where they are; welcome `wagons`). The car is solid (`carSolid`: OBB ±1×±2.2, roof 1.55 walkable). Guns (`G.wpn` rv/sn, `swapGun`, key Q / touch GUN; server `MAGS/FIREMS/RLMS`, `p.am`, `{t:"wpn"}`, shot carries `w`): sniper = bolt action (1 round, ~2 s bolt after every shot, auto), 100 body (one-shot kill, owner) / 150 head, spread .28 from the hip with no crosshair, 0 the instant aim is pressed, 5× zoom + `#wwScope`. Third person `G.set.tp` (key V / Settings; `tpCam`, aiming returns to first person, shots still leave the eyes); own body drawn only in third person (`selfBody`; first-person body was removed, owner: bugged). Crouch (key C hold / touch toggle; `G.crK`, height 1.2, speed 2.6, `headBlocked` keeps you down; flag 32; server `p.cr` lowers the hitbox: head 1.1, body to .95, eye −.57). ADS move speed 1.8 on the ground; aiming mid-jump keeps your momentum. Porch roofs are walkable (collider at 3.26–3.44). Sniper scope = the Oct 28 "nicer zoom" version (owner preferred it; the smoother/sway version was reverted). Saloons have an upstairs gallery along the front (top 3.6, stairs up the right wall, `stairs()` helper) at the upper windows; the church is Orthodox (owner Oct 28: green roof, gold onion domes on drums over the bell tower and the nave, blue ones at the back, three-bar crosses, `cupola`/`onion`) and has a loft over the doors (top 3.5, stairs up the left wall, pews narrowed) with a window above the doors. Batwing doors swing open by themselves (`auto`, no collider, not USE). Computer emotes: hold the emote key → center wheel (`emoWheel`/`emoAim`, mouse picks without turning, release/click/1–9 plays) (PvP relay `glass`, back after 90 s `glassfix`); doors = `G.doors` {open, hs hinges, col (collider only while closed)} toggled by USE (`doUse`/`useTarget`, key F / USE button; relay `door`, state in welcome); church is hollow (pews, altar, stained glass, double doors) with a bell rope `G.rope` → `{t:"bell"}` rung loud for everyone, 3 dongs 1.1 s apart (3 s cooldown); the car (`buildCar`, `G.car`; server `car`): 500 HP (owner Oct 28; was 1,000, before that 300); run-overs do speed-based damage (`(|v|−3)·9`, max 150, 700 ms per victim); the driver is drawn seated (head at 2.45 in car space) and can be shot (`driverHit`: head ball r .27 at (0,2.45,.6), chest r .42 at (0,1.98,.6)); remote players keep their skin across respawns (`N.meta`); in FFA a killed player's body is kept and reused for their respawn (rebuilding a skin mid-match caused a hitch right after kills), steer by looking (owner Oct 28: `G.carLook` = where you look, the car turns toward it, W/S throttle, A/D do nothing; camera follows the look) (`G.dYaw/dPitch`, left/right like on foot, up/down flipped (mouse down = camera up, looking down at the car; owner), eases back after 2.5 s), driver sends `cin` 20×/s, server decides run-overs (|v|>4, car box ±1.35×±2.6) and shots on the car (`carRay`), at 0 HP `carBoom` kills the driver + everyone within 6 m (credited to whoever wrecked it, `how:"boom"`), respawns at `CAR_SPAWN` after 60 s; flag 16 = in the car. Drift (Oct 28): hold Jump (touch JUMP reads DRIFT) = low grip, sideways velocity `c.vr`, smoke + screech. Move speed 5.6 / run 9 / ADS 3.2, jump vy 6.37 (1.5× height); server speed check 10.5 m/s as a carry-over budget (`p.mb`, max 2.6 m + 0.6) so bunched packets after a hiccup don't snap you back. Name tags show through walls (owner). ADS sits the revolver low under the red dot. Phone layout editor: tap a button → size slider (`G.set.bsz`). Settings (localStorage `ww-set`): look + aim-in (ADS) sensitivity, FOV, sound, invert. All sounds synthesized (`SFX`).
- **Multi-pack (Oct 25):** shop "Packs at a time" 1/3/5/10 (`S.pk.qty`, `[data-pkqty]`); `pkBuy` loops `pkBuy1` (the old single purchase, unchanged money path) and awaits each `pkShowOpen` promise (Done button reads "Next pack (k of n)"); balance/sold-out re-checked before each; free packs always 1. Done now stays on the shop.
- **Daily tournaments (Oct 25)** (`tour*`, panels on Flappy `fpStatsHtml` + High-Low `#tourHl` via hlRefresh): `TOUR` fee 3,000 (was 2,500 for the first hour; pot = Σ entry `amt` × cut, `tourPaid`), `TOUR_TRIES` 3 (was 5), day = `divDay()`. Entry = bank doc `tour_<g>_<day>_<me>` {kind:"tourney",from:me,to:"house",amt,g,day,best,bestAt,tries} (player updates best/tries). Flappy: `FP.tourArm` → `FP.tourRun` (no farm BB, no stats), High-Low: `S.thl` stake-free streak (ties lose), best saved on every right guess. `tourSettle` (any page, every 45 s): `bank/tourpay_<g>_<day>` house → winner, pot = entries × fee × `TOUR_CUT` .85 (owner: the 15% house cut is never shown, only the pot). Winner = best, then earliest bestAt. Only one entrant → `refund:true`, the full entry back (owner). Tie for first: 2 entrants → both refunded; 3+ → pot split evenly (`split:n`). Payout docs carry `pays` {id:amt} (ledger + bkActivity read it; `to`/`amt` = first recipient for old copies). Winner's page posts chat once (`prefs.tourWon`).
- **Blackjack tournament (Oct 26):** `TOUR.bj` fee 5,000, one entry/day, `TBJ_START` 5,000 chips on the entry doc (`chips`, hand `h`, `last`, `hands`); `best` = chips with the bet in play already removed (an unfinished hand never helps), ranked/settled by the normal `tourSettle`. Game `tbjDo` = the normal table's rules (bjCanon round on the entry's `h`, splits via `canSplit`/`bjAdvance`, own 2-deck `shoe` + `shufAt` on the entry doc, `tbjSettle` = bjSettle minus abilities; writes are fire-and-forget `tbjSave` for instant play; `tbjHtml` renders like viewBJ) in a full-screen red table `#tbjOv` (`tbjOpen`/`tbjDraw`/`tbjClose`; felt + bet box copied from the real table: `card3d` deal/flip animation via `tbjRound` (state `S.tbjA`, hand key `h.at`), chips `bjChips`, Add/Remove `S.tbjMode`; tbjDraw only redraws when the state signature changes so our own save echo doesn't cut animations; header = stack incl. bet in play, rank, pot, time left; opens right after entering); the Blackjack page panel `#tourBj` has the button + leaderboard. Card boosts don't apply (owner). Winner(s) also get `xs` = max(0, best − TBJ_START) BB from the house on top of the pot (owner Oct 26; split ties each get it; not on refunds).
- **Paid wheel spins (Oct 25):** `WHEEL_PAID` 4,500 (EV ≈ 4,100). One bank doc `wheel_<me>_paid<at>` with the NET (house → me if prize > cost, else me → house), `prize`/`cost` kept on it.
- **Pull log (Oct 25):** every pack opened → `pulls` doc {uid, at, pack, set, price, free, cards, over}. **Daily money report:** `job-moneyreport.yml` (05:20 UTC) runs `tools/jobs/econ_daily.py` → `econ/day_<date>` (raw numeric prefs fields, deltas `d`, bank in/out by kind, packs, `flags` ≥100k); the admin's page stamps live balances once a day in `econ/bal_<day>` (`econStamp`); Admin tab "Daily money report" (`econHtml`). `econ` is admin-only in the rules.
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
  DM banner. Reactions like league chat (hold/double-tap; `r_<playerId>` on the msg; rules let each player change only their own `r_` field). Listens to my thread list + the open thread's newest 50 only.
- **Showcase** (`sc*`): `prefs.showcase` = up to 3 card ids, shown on top of the collection and on the profile; unowned cards hide.
- **Bank** (`bk*`): transfers; loans with optional collateral (seizure all-at-once or one card per interval),
  auto-collection ONLY on payment dates (takes all you have if short), pay in chunks anytime, early payoff =
  max(principal × 1.1 (`BK_PRE`, `bkPreMin`; owner Oct 24: 10% prepayment minimum), principal + interest accrued so far (loan rate & compounding, payments stop accruing when made)) less paid, capped at the rest of the schedule, never below what is overdue.
- **Loan requests** (Oct 24, from the Oct 23 WIP branch `loan-requests`): Bank → Loans → "Ask for a loan" (`bkFormHtml("req")`, `bkReqPost`): the borrower's own cards
  are REQUIRED collateral and leave prefs at once (`collateral` on the doc, `req:true`, `borrower` set, no lender; `mintedAll` counts them). "Lend" (`bkFund`, tap twice)
  writes lender/takenAt/sched/status active → from then on a normal loan. "Take down" (`bkRqCancel`) → cancelled → `bkProcess` returns the cards (collateralBackClaimed).
  Bank page tabs (`S.bkTab`): Money (ability boxes, Send, Recent activity) · Loans (offer/ask buttons → form, requests + offers) · My loans (borrowing, lending, past).
- **Admin House loans** (Oct 24): `prefs.giftLoan` {id,P,mins} (job-fix, e.g. `kjloan`) → `giftLoanCheck` on the player's own page creates `loans/gift_<id>_<giftId>` (lender house, 0%, 1 payment after `mins` minutes, unsecured, a miss = immediate default (owner), `gift:true`), sets `prefs.giftLoanDone`, shows a popup. No chat post.
- **Aura Shop** (`au*`, side menu, tab `aura`, `viewAura`): glowing auras around profile pictures. Catalog `AURAS` (Mythic
  Celestial 1,000,000; Legendary Flames/Electricity(`zap`)/Void 250,000; Animated Sparkles/Rainbow/Hearts 150,000; solid colors 25,000).
  Data on the player's own prefs: `auras` {id:true} (owned forever), `aura` (equipped id, null = none), `auraSpent` (total BB spent,
  subtracted in `ledger().balOf`). A purchase writes all three in ONE prefs update (`auBuy`, busy flag `S._auBusy`, confirm step
  `S.auAsk` that ignores a confirm tap <450 ms after arming); equipping is free (`auEquip`). `auraOf(id)` (equipped AND owned) is
  read by `av()`/`pic()`/`bigAv()`, which wrap the picture in `auWrap()` → `<span class="aw au-<id> lt|md|fx">`: `lt` = tiny
  inline avatars (cheap ring), `md` = normal pics/chat (pseudo-elements only, no SVG filters/particles), `fx` = big pics (SVG filters
  `#auFire`/`#auZap` in `<svg id="auFx">`, particle `<i>` spans). `--s` = avatar size per context. **Priority:** an equipped aura
  replaces the commish ring (`picwrap.aura`/`avaura`; the "Commissioner" title stays), the Dragon glow and the Shrex swamp glow;
  with None they come back. On `av()` the green online outline becomes a small green dot (`.aod`). Reduced motion stops the animations.
  Card auras (`card:1` in `AURAS`: `dragon` = hold any Dragon card, `swamp` = hold Shrex): free, listed under "From your cards" only
  while held (`auCardHas`); `auOwns` checks the card, so selling/trading it drops the aura automatically.
  Dev fee: `shopFee(kind,id,price)` pays the owner 10% of every shop purchase from the house (`bank/shopfee_<buyer>_<kind>_<id>`, not on the owner's own buys).
- **Emotes** (`em*`, Aura Shop → "Emotes" section, played at the live RR + Hold'em tables). **Released (EMOTES_PUBLIC=true, Oct 22).** Gate:
  `const EMOTES_PUBLIC` — while false only `S.canEdit` (the admin) sees the shop section and the 🕺 table button
  (`#emBtn`, `emUI`) and can play one; every client still RENDERS an emote it receives. Flip it to `true` (and add a NEWS
  entry) to release. Catalog `EMOTES` (`tbag` Table T-Bag 250,000: `emTwerk(k,"tbag")` — same hop on/off the table, no turn/cheeks, squats ~2×/s facing the middle; `tongue` Tongue Shake 250,000: `emTongue` — seated, jaw open (`P.jw`, `u.emJaw` overrides the face loop), tongue `emTg` on the animal jaw hinge or at `HUMAN_V.<skin>.mouth` (`tgS` size) for human skins (`P.tg`), head whips side to side ~6 Hz for ~2 s; `ldance` L Dance 500,000; `twerk` Table Twerk 500,000: jumps onto the table (`EM_TW`), cartoon cheeks `emButt` grow in (P.bt) and jiggle (P.bj); per-emote `cam` for your own view and `prev` {table, cam, tgt} for the shop preview; pose extras P.rx body pitch, P.ral/rpx/rpy/rpz right paw). Data on the player's prefs: `emotes` {id:true} (owned
  forever, no equip step), `emoteSpent` (subtracted in `ledger().balOf`); `emBuy` writes both in ONE update (+ `shopFee("emote",…)`).
  Also usable in solo RR vs the bots (`emAtTable`; no rrlook write there). Sync: playing writes `rrlook/{me}.emote = {id, at}` (the look doc both tables already listen to, works in server and phone-host
  mode); `emTick` (called every frame in `rrBuild`'s loop) starts it on seat l when it sees a new `at` < 6 s old. 8 s cooldown
  (`EM_CD`). Blocked (`emWhy`) during a shoot-someone/return-fire sequence (`emFB`: `S.emFBt` set in `rrShotA`, cleared when the
  guns go down; also `c.xg` / `.rraim`), on your RR turn (`emMyTurn`), blacked out or with your Hold'em chair down; those cut a
  running dance (blend back to seated in 0.6 s). Animation: a pose = flat numbers (all 0 = seated), `emLDance(k)` → `emApply`
  (body, chair slide, leg joints `u.legs` hip/knee added in `rrAnimal`, arm IK goals `a.em` that win in `rrSolveArm`, the "L"
  `emLSign` on the head); `emEnd` restores the captured seat/chair exactly. Your own dance swings your camera out (`emCam`).
  Shop preview (`emPrevSync`/`emPrevBuild`): the bear on its chair (`rrChairParts` + `rrAnimal`), renderer only while the card is
  on screen (IntersectionObserver), disposed when it scrolls off or you leave. Add an emote: one `EMOTES` row + a pose function.
- **Skins** (`sk*`, Aura Shop → Skins tab): look like another animal at the live tables. Catalog `SKINS` (`lemur` Ring-tailed Lemur, `nfox` Neon Fox: fox face, slim, emissive cyan limb rings; 250,000 each).
  `diamond` (kind `human`): an uploaded sculpted model with no rig, baked offline (meshopt decimation to ~40k tris, quantized) into
  `public/skins/diamond.bin` + `diamond.jpg` (texture = the GLB's EMBEDDED basecolor; the loose textures in the upload didn't match the UVs).
  `rrHuman` builds the same joint groups as `rrAnimal` (with `HUMAN` proportions) and skins the mesh to bones parented to them, so all
  table animation/IK/emotes drive her (`u.rise` = standing height, `u.lsOff` = L-sign spot, no emote cheeks). Head bone shrinks for your own seat.
  `cerb` (Cerberus, `HUMAN_V.cerb`): multi-material A-pose model → v2 file: header `bones` list (parent rig object, local pos, rest quaternion,
  bind joint) incl. a rigid tail bone swung back behind the chair; textures atlased 2×2 into `cerb.jpg` + emissive `cerb_e.jpg`; joins between
  the hanging arms and the body were cut in the bake. Bake scripts: scratch `hbake/bake.mjs` (T-pose) / `bake2.mjs` (hand-measured joints).
  `ag` (Anime Girl, since Oct 23): Diamond's body (fuller chest/seat, gloves painted off) + the anime model's head and hair, merged by scratch
  `hbake/combine.mjs` from diamond.bin + the older ag bake; texture = 2048×1024 atlas (left: Diamond's, skin tinted to the face; right: the anime texture); HUMAN_V.ag = Diamond's rig. Head source: CC-BY-4.0 model “Anime girl” by Imran Aziz (sketchfab.com/bayharborbutcher) — the credit is in the skin's shop
  description and must stay. Half-body model (cut at mid-thigh): `bake5.mjs` generates lower legs + feet (skin-coloured tubes),
  hard texture seam where they join (no UV blend across the atlas); the right arm is found by growing over the welded mesh from the
  elbow (stops at the shoulder plane, dark hair texels, 3.6 from the arm chain) and every arm/body triangle away from the shoulder is cut;
  the left arm stays in its posed hand-behind-head; bikini bottom/ties ride the hips. Bake source: scratch `hbake/bake5.mjs`.
  `fox` (Fox Girl, Oct 23, original design from the owner's reference pictures): scratch `hbake/foxbake.mjs` (Diamond's body, generated fox head/ears/snout/neck,
  bushy tail on bone 13 "tail" — Diamond's finger bones moved to 14/15) + `foxpaint.py` (paints fur regions into Diamond's UV layout, swatches in the right half).
  `santa` (Santa, Oct 23): CC-BY-4.0 phone scan “Santa Clause 3D Scan” by Christian Day (credit in the shop description, must stay); scratch `hbake/bake8.mjs`:
  joints from height slices, distance weights (soft only at the shoulders), the scan's fused forearms/hands dropped and replaced by generated red sleeves,
  white cuffs and white mitts (texels picked from the coat and beard). `fox` is hidden from the shop since Oct 23 (owners keep it).
  `pir` (Skeleton Pirate, Oct 23): rigged CC-BY-4.0 model “Skeleton Pirate The Drunk” by FireGoat (credit in the shop description, must stay); scratch `hbake/bake7.mjs`
  maps its own 72-joint skin weights onto our bones, drops the bottle (gear weighted to the left hand), body + gear textures atlased side by side in `pirate.jpg`.
  `bigfoot` (Bigfoot, Oct 23): CC-BY-4.0 “primitive man ( aadimanav )” by iRahulRajput (credit in the shop description, must stay). Unrigged 2M-tri fur sculpt:
  scratch `hbake/bfprep2.mjs` (meshopt to ~60k) → `bigfoot/step1*.py` (stick removed) → `bigfoot/bake9.py` (turned to face -z, bone envelopes + neighbour vote,
  arm/body joins cut) → `hbake/capbin.py` (closes every hole with lids, split per limb). `ds:1` = double-sided material (fur flaps), `gz` moves a skin forward on the chair.
  `capbin.py` works on any baked .bin; `dmr/stretch.cjs` lists triangles that over-stretch in test poses (fed back via STRETCH=).
  Santa (Oct 23, owner: "build it like the original"): `LEGS=1.45 STATIC=1 LEGY=0.64 LB0=0.47 LB1=0.63 node hbake/bake8d.mjs santa.glb` (LEGS stretches everything below the hip ×1.45) = the scan as-is, its fused arms ride the
  body (no generated sleeves), legs blend up to y .64; then `CUTY=-0.741 TEX=santa.jpg python3 hbake/capbin.py … 2.5` (base plate off). Anime Girl `hid:1` since Oct 23.
  Unicorn eyes: `HUMAN_V.<id>.eyes=[x,y,z,r]` (from the neck joint) + `eyeYaw`/`iris`/`lid` → rrHuman builds animal-style eyes with blinking lids on the head.
  `uni` (Unicorn, rebuilt Oct 23 by scratch `hbake/bake6.mjs`): uses the GLB's own JOINTS_0/WEIGHTS_0 (its game rig, skeleton stripped) mapped onto our bones, no decimation,
  legs ×2 and arms ×1.35 stretched along the chains, lower legs repainted white with purple hooves (their UVs hit a dark strip). Older notes: chibi plush; lower body + feet rigid with the root (sits on the chair like a stuffed toy), `gy` lifts it onto the seat, negative `rise` (standing lowers it to the floor); `bake3.mjs`. Both files are v2 now and carry finger bones (`fingR`/`fingL`, parent = hand):
  `rrHuman` curls them (relaxed .45 rad, 1.2 while the arm IK goal is a world target = gripping gun/mug/cards, .2 in emotes).
  prefs `skins` {id:true}, `skin` (worn, null = your seat's animal), `skinSpent` (ledger). `skinOf(id)`; the table builds animals through
  `skSeat(seat, uid)` in `rrBuild` (takes effect when the scene is built, i.e. next time you sit). The animal model is a kind in `rrAnimal`/`rrFace`
  (`k==="lemur"`: lathed body, canvas fur texture `lemFur` as map+bump, tapered tube tail with painted rings `lemRings`, mask, cheek ruffs, orange eyes). Shop preview reuses `emPrevBuild` via `SK_PREV["skin:<id>"]` (turntable + wave). 10% `shopFee("skin")`.
- **Camera toggle** (`camTP`, Oct 23): 🎥 `#camBtn` at RR + Hold'em flips `S.camTP` (localStorage `camTP`); `camTP(ctx)` runs every frame after the
  per-frame camera position: eases (`c.tpK`) to behind + above your seat with a little extra pitch down, shows your own head; drops back to first
  person while the revolver is camera-mounted (`c.gun.parent===cam`). Third person also moves your body from its pushed-back first-person spot
  (`selfPos`) onto the chair (`natPos`) and runs `rrNeckAnim(0,…)` for your own head (close-up neck stretch visible; the camera stays behind). Emote camera (`emCam`) still wins while you dance.
- **Table head tags**: over each seated animal at RR / Hold'em, real players show their profile picture in their aura (`hdPic`,
  `md` level, cached; tap for the name), bots their name. RR: HTML `#rrTags` moved by `rrTagsTick` (replaced the canvas sprites);
  Hold'em: inside `thTags`.
- **Active cards** (`activeCards(id)`): every held card doing something (abilities, Joe Camel/Dragon dividends, Peter/Debby/Claire,
  Vector boost). Collection shows the list (`actListHtml`); `AB2_G` maps each AB2 key to its games (keep it complete when adding abilities); owned Common–SR ability cards still at LV 1 show as dimmed 🔒 "Turns on at LV 2" chips (`off`); each game page shows its own chips (`actBar(game)`: cr, rl, bj, hl, fp; the
  curse shows everywhere). Add new abilities there too.
- **Presence**: "● N online" pill, green avatar rings — from existing prefs stamps (no extra writes).
- **Admin tab**: invite codes, data import, card tools (per-card Preview + Add/Change image; a live preview of a card being added), previews.
  Uploading an image for a code-defined card (MV_ADD) writes `cardimg/<id>` and flags `imgOver.<id>` on that collection's meta doc,
  so the upload overrides the static WebP for everyone.

## Oct 23 deflation & balance update (owner)
- One-time per player (`dflRun`/`dflPatch`, `DFL_V`): balance ÷15 with a 10,000 minimum, stored as `prefs.rb15` (new − old, added in `ledger().balOf`)
  + `rbFrom/rbTo/dflAt`; Flappy levels reset (`fpPress/fpSilo` 0, `farmSpent` kept); rat hunt counter → `revMark` (1 hunt per `REV_N`=6 dealer 21s, leftover hunts kept).
  Own page runs it once bank/market/loans/adjust have loaded (`S.ld`, UI blocked by `#dflOv`); the admin's page also migrates offline players. Shown in the Bank statement.
- Rich tax (`richTax`, `taxOf`, `TAX_BR`): at the 1 AM `divCheck`, marginal 10% 100–200k / 20% 200–500k / 30% 500k+ (doubled Oct 25; was 5/10/15), burned: `bank/tax_<me>_<day>` {kind:"tax", to:"house"}.
- Prices: packs (owner 13:03) Common 3k · Uncommon 7.5k · Rare 15k · SR 30k · Elite 75k · Grail 100k · Dragon 250k; Elite pack `coin:{0:3}` = its SR slot is a 50% chance (else Rare); `QS_VAL` ÷15 (Claire burn 35,000 since Oct 23), `CARD_DIV` [0,0,3,20,100,500,10000,25,0] (Joe Camel 700), emotes/skins ÷3 rounded up to 5k,
  `FP_*_COST` ×1.5. `pkHalf` (inside `pkSlot`): every chance above a slot's lowest rarity halved, removed chance → that lowest rarity.
  Set bonuses 1.25× each (full rarity set / own every copy), Super Rare–Grail only. No BJ streak bonus (`BJ_STREAK_BB=0`). Rat ×2 speed, 500 body / 1,000 head.
  King Slop 2/day, Dean `CR_EDGE` 1.5%. Jimmy shows as rarity "Curse" (`CR_CURSE`, `crOf(c)`; still rolled as a Super Rare, excluded from SR counts).
- Later the same day: outstanding bets created before `BET_CUT_AT` cut to 1/10 (stake/takerStake, `cut10`, originals in `stake0`/`takerStake0`; run once by
  the admin's page in `dflRun`); Debby `DEBBY_AMT` 5,000; weekly +2,500 top-up ended (`WEEKLY_END`), replaced by a daily `topUp` at 1 AM (+1,000 when under 10,000,
  `prefs.topUp/topDay`, in balOf). Pack `tune:[[r,target,hiExclusive?]]` sets the shop's "at least one r+" chance exactly (`pkFactors` bisection):
  Elite pack SR+ 55%, Grail pack Elite+ 20.5% / Grail+ 12.5%, Dragon pack Grail+ 20%.
- Skin `paladin` "The Crusader" (150,000): CC-BY-4.0 “THE SAVIOR — Dark Fantasy Paladin” by Atahan (credit in the description). Scratch `pal/bake10.py`:
  axe removed (handle/blade cut by position), arms static on the chest, legs + robe by side; then `hbake/capbin.py`.
- House sports lines: `hv(ml)` prices each side at (2.1/2.2)/p (−110 on a coin flip) from the fair feed lines (scoreboard/futures stay fair; game docs keep
  fair odds); NFL: `tools/jobs/nfl.py` EDGE = 2.1/2.2, spreads/totals −110.

- **Stale-tab guard (Oct 23):** tabs still running a pre-deflation copy kept spending old balances (King Julian went negative). The shim now stamps
  every set/update/add with a new random `wv`, and `firestore.rules` (`freshWrite()`) refuses non-admin writes whose `wv` didn't change. If you ever
  write Firestore outside the shim from the app, include a fresh `wv`. Bump the `v2.` prefix in `WV()` + rules if you need to lock out older copies again
  (rules would then have to check the prefix). One-time repairs run by the admin's page: `fixOnce` (config/fixes: kj40k, neg0).
- **Skin `monk` "Shadow Monk" (150,000):** CC-BY-4.0 “Shadow Monk Assassin - Dark Fantasy” by Pigcraft. Scratch `monk/bake11.py`: staff below the left hand cut,
  left arm + staff static on the chest, right arm rigged.

- **Oct 23 later (owner):** Jimmy (curse) `pw:.5` and pulled from League Moments + Fantasyland packs too (`packCat` adds `curseCards()`; also shown in those
  collections; still 3 copies total); his tithes burn (`TI_BURN`: pull docs have `tos:[]`, `tiSettle` does nothing — balOf already takes floor(tiWin/10)). **Oct 25 (owner): undone** — `TI_BURN=false`, tithes split among the others again; owed amounts from the burn days are written off once per player (`prefs.tiBurnFix` + a `ti_<me>_<paid>` doc with `tos:[]`). The 5,000 Remove-curse fee is now a pull-style tithe doc (`note:"Curse removal"`) split among the others instead of `prefs.curseFee`.
  Dev fees removed (`PACK_FEES=[]`, `SHOP_FEE=0`). 5% of every player-to-player card sale burned from the seller (`mkFee`, sales with soldAt ≥ `MK_FEE_AT`, in `cardMoney`).

- **Stats reset (Oct 23, 3:45 PM ET):** leaderboards/standings/"overall" lines start over without touching balances. Casino: `prefs.sb0` = stat values at the reset
  (admin fix job `statreset`), shown through `stq(q)` (value − sb0; Flappy best = `prefs.flapBestS`, best since the reset). Betting: `ledger().rec/net/wagered`
  only count bets accepted/created from `STAT_RESET_AT`; balances, weekly nets and recaps still use every bet. Auras ½ price, skins −25%, emotes ½ (same day).

- **Card levels & crafting (Oct 23, owner spec + New_Card_Expansion_Database.xlsx):** a leveled copy is its own key in `prefs.cards`: `"<cardId>@<level>"`
  (`baseOf`, `lvOf`, `lvK`); `cardById("x@2")` = base card + `{id, base, lv}`. Level 1 = the plain id. Leveled keys never count toward the print run
  (`minted()` only sees plain ids) and move through market/offers/trades/loans like any card. `cardCount(key)` = that exact key; `cardCountAll(id)` = all
  levels (ownership, set completion); `ownCards()` = every key held (use it for "my cards" pickers). Images/`data-cimg` normalize to the base id.
  Craftable = Multiverse/Fantasyland, Common–Elite, not the curse (`craftable`); `LV_MAX=[7,5,3,2,2]`; dividends `DIV_LV` (Joe Camel 700/1,200 via `DIV_LV_JOE`);
  `divCalc`: per card only the top-level copy pays its level, the rest pay LV 1; full rarity set (any level) 1.25× for SR–Grail; the "own every copy" bonus is gone.
  Every craft needs copies of the same card (`cfAny` false, owner Oct 23). Card Crafting tab (`viewCraft`, state `S.cf`, recipes `CRAFT`, pickers `cfPick`, `cfAuto`): `craftDo` re-reads prefs, then ONE prefs update (cards, `craftSpent`
  += fee (burned, in balOf), `craftLog.<at>` → Bank statement line). Animation `cfAnim` (35% faster since Oct 25; the hammer is an original inline SVG Norse storm hammer with `.cfbolt` lightning, not Marvel's design) (+ `cfSfx`; `pkCalm()` = short version). Crafting to MAX posts in chat.
  Level badge `lvBadge` in `cardHtml` (MAX for non-craftable). Wants/collateral may carry `lv` (`mkFits`; "Any level" when omitted).
- **Oct 26 (owner):** Grails pay `GRAIL_DIV` 1,000/day flat (in `cardDiv`; cards with their own `div` keep it). `LV_MAX` [7,5,4,3,2]: Rare LV 4 (`CRAFT` [2,25000], `DIV_LV` 1,200), Super Rare LV 3 ([2,40000], 1,800); AB2 values extended one level (thanos 7.5, caked 6, rinker 15, logan 10,000, darth 2, crew 3).
- **Your ability cards (Oct 26):** first Crafting screen `cfAbHtml()` lists owned craftable cards with an AB2 ability: now / next level / copies toward it; tap → that recipe (`data-cf="goab"`).
- **Craft to max (Oct 25):** first Crafting screen lists `cfMaxList()`; `cfMaxPlan(id,cards,bal)` = fewest crafts taking ONE copy to the highest level the copies (and balance; else `short`) allow, using higher-level copies first; `craftMax` re-reads prefs and does it in ONE prefs update (one `craftLog` entry per level step).
- **Level abilities (`AB2`, keyed `set:nmKey(name)`; `ab2(k,id)` = the player's best value = their top-level copy):** Common–Super Rare are OFF at LV 1 and use
  the sheet's value for that level from LV 2 ("option A"); Elite/Grail work at LV 1. Wired: `vontrap` (+X BB/day per LV2+ copy, divCalc `vt`), `dwillie`
  (all-in loss refund: roulette/BJ/High-Low, `abWin(d,extra,allin)`), `shock` (+% on casino wins and on bets via `bx`), `luke` (Bank: steal % of a balance 1/day,
  bank kind "luke"), `thanos`/`caked`/`darth` (in `bjSettle`, `r.bonus`), `logan` (daily free bet on NFL/NBA/House straight bets: bet `free:true`, ledger: loser
  poster pays 0, not in pending; `freeHtml`/`freeUse`, `prefs.freeDay`), `shabbat` (Bank: lend 25,000, bank kind "shabbat" {back:26250}: ledger repays 1/24 per
  full hour), `bucket` (+% on live RR/Hold'em profit), `shine` (Fridays in divCheck: 65% paid, `prefs.shineEarn` in balOf, `shineLog`, popup), `diva` (`divaP`
  skins/emotes), `rinker` (Flappy cap + run bonus), `crew` (parlays via `bx`), `paradise` (`prefs.paraN`/`freePacks`, free Common pack), `crndd` (`crnddKill`/`crnddBO`),
  `rookie` (rat ×2), `gooner` (roulette wins +%), `vail` (`pkPrice`). Bets snapshot bonuses in `bx:{playerId:%}` at create/accept (`bxOf`); the ledger adds
  floor(win·%) to the winner. Daddy Christian: after 6 right in a row the High-Low multiplier doubled per guess — compounded (Zartog +20M overnight Oct 24→25); since Oct 25 a streak of 7+ (`st.n>HL_CHR_AFTER`=6, owner 4:34 PM; was 6+) pays the cash-out ×`HL_CHR_X` 1.25 (`hlPayNow`; ≈104% return playing to 6), per-guess multipliers normal. Celestial aura at `md` size: two spinning gold squares (`auExtras` md, `.sq`). Die for the Whale / Cryptid – Bigfoot: no ability (owner).

- **Pack prices (owner, Oct 23 17:36):** ÷4 from the 13:03 prices: Common 750 · Uncommon 1,875 · Rare 3,750 · SR 7,500 · Elite 18,750 · Grail 25,000 · Dragon 62,500 (odds unchanged).
- **Slots progressive (Oct 24):** pay table (Oct 24 late): per line best rule `slRule` — 3-kind `SL_PAY` [–,15,25,50,120,300,1140], mixes `SL_GEMS` 40 (💎/7), `SL_BARS` 5 (bell/cheese/💎/7), `SL_FRUIT` 3 (cherry/lemon), cherries reels 1+2 ×5, cherry reel 1 ×1; odds table `slPayHtml`/`slOdds` (exact enumeration) + progressive pot; bet = LINE bet (`st.bet` 1–`SL_LMAX` 200, total ×5 = up to `SL_MAX` 1,000), return = line bet × Σ line mults; win list per line in the message; `slParty` full-screen celebration on the jackpot or a win ≥25× the spin: `slPot()` = `SL_JP_SEED` 10,000 + floor(1% × Σ prefs.slWag) − Σ prefs.slJP (derived from prefs, no shared doc); three 7s on any line win floor(pot × bet/1000), added to slNet. 5 paylines (`SL_LINES`: rows + diagonals; `slRoll` = 3×3 grid of independent stops, `slEval`; return floor(bet × Σ line mult / 5), same RTP). Base 94.0% + 1% pot = 95% RTP (`tools/test/slots.test.mjs`). Reel symbols are an SVG sprite (`SL_DEFS`, `slIco`). Shop (owner Oct 24): auras ½ again, emotes Tongue 5,000 / T-Bag 10,000 / others 15,000 (shop sorted cheapest first), all skins 25,000 (2:20 PM; earlier 20k/50k).
- **Oct 23 evening:** Vector = 2 boosted runs a day (back to 1 since Oct 24 2 PM) (`FP_BOOST_DAY`, `prefs.flapBoostDay/flapBoostN`); Debbie · Dynasty Grail (`mv-art-65`) dividend 750 (`MV_DIV` in `mvMerge`). Crafting Guide (`cfGuide`), picker Close bar (`.cfpkfoot`), ability cards first (`cfHasAb`).

- **Oct 24 1 AM (owner):** every card dividend ×1.5, then ×1.2 more at 2:30 PM (`DIV_X`=1.8 inside `cardDiv`; div15 top-up = amt·0.5/DIV_X) and quick-sell ×1.5 (`QS_X` in `qsVal`; Claire 52,500); players already paid on Oct 24 get the extra 50% once (`div15`, `prefs.div15`).

- **Elite pack (owner, Oct 24):** tune `[[6,old Dragon chance],[5,.05,6],[3,.55]]` = Grail 5%, SR+ 55%, Dragon unchanged (Elite+ became ~11.7%).

- **Daily Spin (owner, Oct 24):** `WHEEL` prizes/odds (nothing 20 · 1k 35 · 2.5k 18 · 5k 15 · 10k 7 · 20k 4.5 · 50k 0.5 %), one spin per Eastern half-day (`wheelSlot`: date+am/pm), not stackable; bank doc `wheel_<me>_<slot>` {kind:"wheel",from:"house",to,amt,k} = payout + used marker. Auto-pops when ready (`wheelOpen(true)`), side menu "Daily Spin". Oct 24 2:30 PM: 🎁 slice 5% (1k slice 35→30): `wheelShopPick` = an unowned aura/emote/skin (not hidden/card auras), chance ∝ 1/price; granted in prefs (aura equipped if none), bank doc carries `item`; own everything → 25,000 BB. Look (6 PM): 24 equal pockets `WHEEL_LAY` (prize index per pocket, common prizes repeated, 50K once); the prize is picked by p, then the wheel lands on one of its pockets. 50K 1% (1k 29.5%). Bonus spins: `prefs.whFree` (granted by `job-fix` e.g. `kjspin`), used ones = bank docs `wheel_<me>_free<n>` (`wheelFreeLeft`, `wheelId`). Shop buys post a chat line (`kind:"shop"`, eyebrow 🛍️ Shop).

- **Slots (owner, Oct 24):** tab `slots` (casino menu), `viewSlots`/`slRefresh`/`slSpin`; 3 reels on strip `SL_W`, pays `SL_PAY` (+ two/one cherry), 95.0% RTP (`node tools/test/slots.test.mjs`), bets 1–`SL_MAX` 1,000. Money `prefs.slNet`/`slSpins` (LV batched, in balOf, standings casino, `stq`, session `sl`).

- **Oct 24 1 PM (owner):** Cheese Farm upgrade costs ×0.45, then ×0.85 at 2 PM (`FP_PRESS_COST`/`FP_SILO_COST`); `job-fix` `gift20k` = bank doc `gift20k_<id>` {from:"house",amt:20000,kind:"gift"} for every player with a team.
- **Leveled quick-sell (owner, Oct 24):** `qsVal` × `lvCopies(c)` = product of the recipe card counts up to that level (no fee refund; no arbitrage vs quick-selling the copies).

- **Site perf (Oct 28):** the fall-leaves block in index.html exists twice; the guard `m.querySelector(".leaves")` makes only the first build (7 header + 6 chat leaves, was 2×(12+14)); pumpkin bob off; nav has no backdrop blur; `body.idlefx` (added after 40 s with no input, removed on any input) pauses every CSS animation (after 12 s since the later Oct 28 pass). Later Oct 28: leaves are STATIC (random top/rotation, no keyframes; chat leaves hidden), the filter/blur aura keyframes `auIri`/`auIriB`/`auraPulse` are overridden to static, and while BiggieTown is open everything else on the page is `visibility:hidden` + paused (`body.wwon`). `WW._net(m)` = test hook that feeds a fake server message (used by the scratch soak test: 12 add/move/shoot/kill/reuse rounds, no growth in geometries/textures/objects/DOM).

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
  Projections use each team's BEST lineup from its roster (`best_fill`; starters whose game started are locked at actual; taxi/IR out),
  not the lineup they set — closes the bench-everyone-then-bet-yourself exploit (Oct 23). Tests: `python3 -m unittest test_scoreboard`.
- `job-futures.yml` Tuesdays 2:45 AM ET — playoff/title odds simulation → `meta/futures`.
- `job-grade.yml` — grades finished league games from Sleeper (bets + parlays then pay automatically): on its own every Tuesday from the 12:01 AM ET reset (04:01/05:01 UTC) with retries through Wednesday; `nfl_week_final` holds a week until every NFL game of it is over. Manual run still works.
- `job-mpflag.yml` manual — live-tables server switch.
- `job-econ.yml` manual, read-only — dumps prefs/bets/games/bank/market/loans/adjust/offers/plat/meta/nfl/nba/profiles as a 1-day private artifact
  (`gh run download <id> -n econ`; load into the emulator with tools/migrate/import.js, then read `ledger()`/`divCalc` in the app). Never commit it.
- `job-fix.yml` manual — named one-off data fixes in `tools/jobs/admin_fix.py` (each recorded in config/fixes; `kjflap` = King Julian farm usage −5,000 on Oct 23; `zhrollback` Oct 25 = Zartog + hung like hernandez card counts → min(now, Oct 23 2:21 PM snapshot) after the High-Low exploit pack spree, no refund, +75,000 each); `zcelestial` = Zartog loses the Celestial aura, no refund; `zhfarm` = both of them Press + Silo −2 levels, no refund). Pack openings aren't logged per card, so exact "bought after X" removals aren't possible.
- Session counter (Oct 23): `sessLn(game, net, inPlay)` fills the `sessChip(game)` pill next to each game's balance (3D tables: `.sessstg` at the top); counts settled results only.
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
- New versions: the deploy workflow stamps the commit sha into `APP_BUILD` (index.html) and `/version.txt`; open apps poll it
  (on focus + every 5 min) and show a "New update ready · tap to refresh" pill (`updCheck`). Don't rename `__APP_BUILD__`.
- Everything top/bottom-anchored must respect `env(safe-area-inset-top/bottom)`.
- Chat sizing uses `visualViewport`; don't reintroduce `window.scrollTo(0,0)` hacks.
- Inputs need font-size ≥16px (iOS zoom). Global key handlers must ignore typing in inputs (`keyInField(e)`).
- Icons are cache-busted with `?v=N` — bump N when replacing icons.

## Workflow conventions
- Small focused commits; message explains the user-visible change.
- **Every user-visible change gets a "What's new" entry**: in index.html search `const NEWS`, add a new entry at the TOP
  with `v` = previous top v + 1, a short date, and 1–5 plain-language lines (no tech talk, e.g. "Multiverse has been expanded").
  Players see it once on their next sign-in after the deploy (`newsPopup`, seen state `prefs.newsSeen` + localStorage) and it
  never shows again after they close it. Never edit an entry that already shipped — add a new one.
- Before pushing: syntax check + `sync-shared --check`; after pushing, confirm the Actions run is green
  (`gh api repos/s4mt1mms-cyber/BiggieCheese-s-Sportsbook-Casino/actions/runs?per_page=1`).
- Coordinate with the owner before risky changes; if two people work at once, use branches/PRs to avoid collisions.
