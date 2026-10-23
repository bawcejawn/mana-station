# Mana Station: who can do what, and how to launch

Status on 2026-10-23 (branch `audit-2026-10-fixes`):

- **Mainnet audit (2026-10-23, tag `audit-2026-10`, commit ef59727):** 1 Critical, 13 Medium, 27 Low, 29 Info. All
  fixed or accepted on branch `audit-2026-10-fixes`; the accepted ones and why are in section 8. The report is
  private: no public issues while fixes are pending.
- **Unit tests:** 265 of 265 pass (`contracts/station/assembly/__tests__/`; the audit's proofs are in
  `Station.audit-2026-10.spec.ts`; the escrow and slot-fee fuzzers check `balance = held + owed` after every step).
- **Testnet:** `testnet/run_tests.mjs` (passes, free checkout, refunds owed and claimed).
- **Playground:** station v4 (`17cDBCCPLNtgAULweeiLeViBRKnaZFDGps`, the audit-2026-10 fixed code, under testnet keys
  rotated after O1-01) is live on the Koinos testnet and handed over to Carl's wallets (owner + council 1–3). The old
  v3 station `1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc` still holds 110 tKOIN, which Carl's council can withdraw from it.
- **Three ways in (Oct 20):** a **Mana pass** for a wallet, an **app plan** for a contract, and **free Mana** the owner gives their own apps. A wallet with no KOIN and no Mana can buy, renew and cancel (free checkout).
- **Not done yet:** mainnet deployment, a legal review of the terms, and a domain.
- **Audit Bot audit (2026-10-22, commit 4343f83):** fixes on branch `audit-fixes-1` (AB-001 … AB-022). Unit tests: 78
  original + 51 audit proof tests + 30 regression tests (159), all pass. The rules below are updated to match.
- **Slot squat follow-up (owner decision, 2026-10-22, same branch):** every allowance pays a **slot fee** per day of its
  term (`slot_fee_per_day`, proposed $0.02), and the last **`app_reserved`** slots below `open_cap` (default 10) go only
  to app plans for deployed contracts. Unit tests: 163, all pass (the audit's slot-squat proof test included).
- **Audit Bot fix check (2026-10-22, commit dd5148d), same branch:** AB-024 (per-user cooldown at most 1 hour, read
  from the current config), AB-025 (a veto blocks the action's kind and target for 14 days), AB-026 (the helper's
  question travels on a private channel), AB-027 (target and payee approve directly), AB-028 (a cancel after a burst
  charges the Mana used), AB-029 (a renewal that hasn't started comes back whole) fixed; AB-023 (squat cost) and AB-030
  (suspension refunds more than a cancel) accepted by the owner, docs corrected; AB-031 refusal tests check the
  contract's reason. Unit tests: 203 pass, 5 skipped (the proofs of the two accepted findings); every real survivor of
  the fix check's mutation run now has a killing test.
- **Daily action floor (owner decision, 2026-10-22, same branch):** per-user `day_actions` at least 24 (1 an hour), for
  the same reason as AB-024; an older stored config below 24 reads as 24. Unit tests: 206 pass, 5 skipped. The site's
  pages are now built on Linux with LF sources (`.gitattributes`), and a test checks every page's CSP script hashes.
- **Audit Bot fix check (2026-10-22, commit d982a24), same branch, owner decisions:** AB-032 (a paid pass or app plan
  keeps the limits it was sold with until its term ends: owner changes can loosen a running term, never tighten it;
  free use follows the current settings; pause still stops everything), AB-033 / AB-034 (limited vetoes: a veto
  blocks the whole kind for 14 days, any wallet, except proposals that had all their approvals before it; each member
  sets at most one block per kind per 30 days; a council change removing the vetoer, or the member whose proposal was
  vetoed, is never blocked), AB-035 / AB-036 / AB-037 (days another wallet paid can't be drawn on early; a cancel
  charges only the buyer's own terms; a started term another wallet paid comes back pro rata; `get_escrow` shows
  exactly what a cancel pays), AB-038 (helper 0.3.2: no page code runs while the helper handles its private channel;
  shown in Chromium), AB-039 (a member may withdraw their own departure proposal), AB-031 (every refusal in
  `Station.spec.ts` checks the contract's reason), AB-017 (killing tests for the real mutation survivors). Unit
  tests: 244 pass, 5 skipped.

## 1. Access: who can do what

"Signs" means the chain's `check_authority` for that address passes. For a wallet that means its key signed. For a contract it means its own `authorize` said yes.

**Called directly (AB-004):** the owner, council members, buyers and payers must also call the station themselves: as a
top-level operation of their transaction, or from their own contract. A call relayed by some other contract they happened
to sign a transaction for is refused, even though their signature is on the transaction. The same holds for an app
plan's target app, a pass wallet and a ticket's payee approving a purchase (AB-027). The station itself is never
accepted as a buyer or payer (AB-020).

### Reading

| Action | Who | Tested in |
|---|---|---|
| Status, prices, quotes, passes, plans, tickets, escrow, connected apps, proposals | Anyone, with no wallet | `owner.html`, `get.html`, testnet run |

### Buying (wallets and app builders)

| Action | Who must sign | Tested in |
|---|---|---|
| `buy_allowance` kind 1: an **app plan** | The buyer **and the app itself** (so nobody can claim someone else's app) | unit "#3 target squat"; testnet "buy_allowance without the target app's signature refused" |
| `buy_allowance` kind 2: a **Mana pass** for a wallet | The buyer **and the pass wallet itself** | unit "wallet Mana pass … only the wallet itself can approve"; testnet "wallet Mana pass without the wallet's own signature refused" |
| `renew` | The wallet paying for the renewal signs. Anyone may extend an allowance with their own money; it can never be renewed without a signed payment. | unit "no auto-renew… only the payer can renew" |
| `buy_big_upload`: a ticket (24 hours by default, 1 hour to 7 days) | The buyer **and the payee** (AB-005: nobody can put a ticket on another wallet or app and lock it out). The buyer passes the lifetime the quote showed (`min_lifetime_ms`); a shorter one is refused (AB-001). The ticket only ever pays for the payee's *own* contract, and the payee still signs those transactions. | unit "big-upload ticket only sponsors…", audit "rt-imp-ticketpayee", "rt-ins-ticket-lifetime"; testnet ticket section |
| `cancel_allowance` / `cancel_big_upload` | The buyer, while a paid day is still unused (audit-2026-10 C-1: a cancel that would change nothing is refused). A buyer cancel charges the days used at the 1-day price for that size (AB-010); if more Mana was sponsored than those days cover (a burst across a 6-hour window edge), the days that Mana covers are charged instead, from the buyer's own terms only: the running one, then later ones (AB-028). Days another wallet paid for can't be drawn on before they begin (AB-035). A renewed term that hasn't started comes back in full, minimum included, to whoever paid it (AB-029); a started term another wallet paid comes back pro rata, its unused whole days (AB-036). `get_escrow` shows exactly what a cancel would refund for each term (AB-037). A suspended buyer can't self-cancel (the unused share was already refunded at suspension; sanctions: frozen). | unit escrow and refund tests; audit "rt-thief-tier-arbitrage", "rt-thief2-cancel-slotedge", "rt-thief2-renew-grief", "fixes-2"; testnet "suspended buyer cannot self-cancel" |
| `close_ticket` after expiry, `release` after a term ends | Anyone. The money only ever goes to the treasury or back to the buyer. A frozen (sanctions) purchase or a sanctioned buyer's is refused. | unit "release before the end refused even for the owner" |
| `claim` / `get_owed` (audit-2026-10 M-5) | Anyone may call `claim(token, to)`; it pays `to` everything the station owes it in that token and nothing else. Refunds and releases are **recorded as owed** (`escrow_totals.owed`) instead of paid inside the purchase that triggered them, so a stablecoin that refuses one transfer (paused, blocklist) can't block unrelated purchases. The site sends `claim` in the same transaction as every cancel and ticket close. Refused while `to` is sanctioned. | audit "M-5" (2 tests); fuzz "escrow" (balance = held + owed) |
| Limit per wallet | At most 5 open allowances and tickets together, counting allowances **for** the wallet too (AB-002). Station-wide, Mana sold decides whether a new allowance fits, up to `open_cap` open allowances (owner setting, 1 to 256, proposed 50; renewals are never refused by it), with fixed safety caps of 256 open allowances and 512 open purchases. Mana passes cost at least `pass_min_purchase` ($0.25 proposed). Once open allowances reach `open_cap - app_reserved` (50 - 10 = 40), only app plans whose target is a deployed contract are sold (renewals are never refused). | unit "one wallet's open allowances…"; audit "squat", "fixes-1"; "squat at open_cap 50 (Oct 22)" |
| Slot fee | Every pass and app plan pays `slot_fee_per_day` for each day of its term on top of the Mana price; renewals pay it for their own term; big-upload tickets don't. The quote shows it (`slot_fee`) and includes it in `price`, so `max_price` covers it. A buyer cancel keeps it for the days held (the current day counts) and refunds the unused days' slot fee with the rest; owner and suspension refunds stay pro rata of the whole price. | unit "Slot fee and slots kept for real apps" |

### Owner (day-to-day operator)

| Action | Who | Tested in |
|---|---|---|
| Connect, change or disconnect a free app (`connect_app` / `disconnect_app`, `set_exempt`); per-function caps (`set_entry`) | Owner. Refused for KOIN and stablecoins (AB-009) and for a contract with a live paid allowance (AB-001). | unit "connected apps"; audit "exemptmoney", "silent-denial"; testnet connect, list and disconnect |
| Owner boosts (`set_app` boost) | Owner. All active boosts together at most `buffer_bp` of the daily budget (AB-003). | audit "boost-ticket", "fixes-1" |
| Prices (`set_price`), `owner_refund` (never for the operators' own purchases) | Owner | unit suspension and L4 tests |
| Suspend or unsuspend a buyer | Owner. Reasons 1, 3, 4 (abuse, AUP, legal) **refund the unused share automatically** when the suspension starts (whole unused days pro rata, the unexpired unused share of a ticket, no minimum or fee kept); the owner keeps only what was served. That can be more than the buyer's own cancel would return: intended (owner decision, Oct 22, AB-030), and the terms say so. Reason 2 (sanctions, audit-2026-10 M-3) freezes **by payer**: every open purchase the wallet paid is marked frozen and is neither refunded nor released to anyone, even if the suspension is later lifted or changed, until the council settles it (kind 9); terms other wallets paid on its allowance are refunded to them pro rata at once; nothing owed to it can be claimed while sanctioned. The owner can't suspend the owner or a council member (E1 L-2). (AB-001) | unit "suspension (AB-001)"; audit "verify-suspend-confiscate", "fixes-1" |
| `set_config`: limits only | Owner. **Refused** for the owner, treasury, council, threshold or delay, and for any higher ticket fee. Those all go through the council. Also refused (AB-001): a ticket lifetime outside 1 hour to 7 days, `hard_max` below 1 Mana, `admin_min` above 10% of `koin_amount`, `max_ops` below 2, per-user limits of 0 or a daily per-user Mana below `hard_max`, and (AB-024) a `cooldown_ms` above 1 hour or one that with `per_min` would allow fewer than 1 action an hour, or a `day_actions` below 24 (1 an hour; a lower value stored by an older config reads as 24). **A paid term keeps the limits it was sold with (AB-032):** each pass and app plan term stores `hard_max`, `max_ops`, `per_min`, `cooldown_ms`, `day_actions`, `new_actions`, `day_mana` and `new_mana` at purchase or renewal (the quote shows them); while it runs, each limit is the more generous of the stored value and the current setting. So a change loosens running terms at once and tightens only new purchases, renewals bought after it, and free use (free apps, operators, free checkout), where the current settings apply at once (the cooldown in force is the current setting; a user's record keeps only when their cooldown started). Only a pause stops paid terms. `max_allowances` is ignored. Also refused (Oct 22): `app_reserved` (0 = 10) not below `open_cap`, `slot_fee_per_day` above $1 a day, and `slot_fee_per_day` 0 on a real (mainnet or testnet) build; a stored 0 from an older config reads as $0.02 there. | unit "operators: … money settings need the council"; audit "rt-ins-ticket-lifetime", "rt-ins-silent-denial", "fc-AB001-cooldown", "v-AB024-cooldown", "fixes-2" |
| Resume after a pause | Owner | same |

### Council (2 of 3 on the playground; 3 to 7 members, threshold at least 2 and below the size, audit-2026-10 M-4)

| Action | Who | Tested in |
|---|---|---|
| Pause the station (emergency brake) | The owner or **any one** council member | unit "operators"; testnet operators section |
| `propose` a guarded action, `approve` it | Council members | unit "audit #1" block; testnet council section |
| Veto (`cancel_proposal`) during the wait | **Any one** member. Exception: a member can't veto their own removal (but a proposer may withdraw their own proposal, their own departure included: AB-039). After a veto, no action of the same **kind**, for any wallet and whatever its contents, can be proposed or carried out for **14 days**, whoever sits on the council then (AB-011, AB-025, AB-034): no upgrade at all; no withdrawal, rescue, treasury or owner change to any wallet; no council, delay or ticket-fee change. **Limited vetoes (AB-033):** a proposal that already had all its approvals before the veto continues; each member's vetoes set at most one such block per kind in 30 days (a later veto by them still cancels its proposal, without a new or longer block), so two colluding members can hold a kind for at most 28 days; and a council change that removes the vetoer, or the member whose proposal was vetoed, is never blocked. A member withdrawing their own proposal is not a veto. So 2 of 3 can still replace the vetoing member and pass the vetoed change, but only after at least 14 days plus the wait. Runbook: don't veto a council change that can't reach the threshold anyway; just don't approve it. | unit "veto" and "H1"; audit "rt-ins-council-veto", "fc-AB011-veto", "v-AB011-bytevariant", "fixes-1", "fixes-2", "fixes-3", "fc2-veto-*", "rt3-ins-vetostock" |
| `unapprove` | The member who approved, while the proposal isn't carried out (audit-2026-10 G-04). | audit "G-04" |
| `execute` once approved and the wait has passed | Anyone, within **30 days** of the proposal becoming ready (G-04: after that, propose again), and only once the **current** waiting period has passed since it got its approvals (raising the delay applies to ready proposals too). | unit "KOIN withdrawal: 2 of 3, then 48 h"; audit "G-04" |
| Settle a frozen purchase (kind 9, M-3) | Council proposal: unfreeze, refund the amount chosen to the payer (owed, claimable once sanctions end), release the rest to the treasury. `admin/station-admin.mjs propose-settle` or the Owner page. | audit "M-3" |

**Guarded actions:** upgrading the code, withdrawing KOIN (kind 2 lowers `koin_amount` with it, so the owner can't block a withdrawal by raising it), rescuing a token sent by mistake (never what is held or owed), changing the council, the waiting period, the treasury or the owner, raising the ticket fee (tickets already sold keep the fee they were sold with, E1 L-1), and settling a frozen purchase (kind 9).

- **Wait:** at least 48 hours on mainnet (2 minutes on the playground), at most 30 days.
- **Cap:** each member can have at most 3 proposals open at a time.
- **Council change:** restarts the wait on every open proposal, but keeps when each had all its approvals (G-05), and closes the open proposals of removed members (G-07).
- **Owner and council are separate:** the contract refuses an owner who is also a council member, at init, in `set_config`, and when a council change (kind 4) or a new owner (kind 8) is proposed or executed (AB-013).

### The station's own key

The key can do **nothing on its own**:

- **Moving money:** `authorize(contract_call)` says yes only when the station's own code is the caller, so the key can't move the station's tokens.
- **Uploads:** `authorize(contract_upload)` allows only council-approved code, after the wait, uploaded alone in its transaction with all three permissions kept.
- **Paying:** the station never pays for its own transactions.
- **Setup:** `init` works only inside the transaction that uploads the station.

Tested in:

- unit "the key alone moves nothing", "upgrade", "C1";
- testnet "uploading code the council did not approve is refused", "attacker code + approved code in one transaction is refused", and "the approved code, alone, after the wait, uploads WITHOUT the station key".

## 2. Who the station pays Mana for

On each transaction it is asked to pay for, the station checks `authorize(transaction_application)` in this order:

0. **Free checkout:** a wallet's own `approve` (to the station, in a priced stablecoin, value above 0 and no more than the wallet holds) plus `buy_allowance` / `buy_big_upload` / `renew` with that wallet as buyer; or a `cancel_allowance` / `cancel_big_upload` by the buyer that would refund something; or a `claim` to the payee of something it is owed; or a cancel followed by that claim. Per-player limits apply, and all free checkout together shares one Station-wide 24-hour window capped at `checkout_bp` of the daily budget (default 5%, audit-2026-10 C-1). Buys are refused while paused; cancels and claims aren't. (unit "free checkout", "C-1 window"; testnet "checkout" section)
1. **Calls to the station itself, from the owner or a council member.** Allowed for admin and votes, even while paused, within the same per-minute and per-day limits as players. Only `set_paused` and council votes / vetoes (`approve`, `cancel_proposal`) **by council members** may be paid below the safety floor (down to the transaction's own limit); every other admin transaction, the owner's included, keeps the floor like all paying routes (AB-012, audit-2026-10 Info).
2. **Paused:** nothing else is paid for.
3. **A big-upload ticket holder:** uploading or calling *their own* contract, up to the ticket's Mana, for 24 hours.
4. **Calls into one connected free app:**
   - only that app in the transaction;
   - per-function caps, or listed functions only in strict mode;
   - per-player limits: a few actions a minute (10 on the playground), then a pause, one per block, and a daily cap that is smaller for new players;
   - the app's daily amount; an app with a reserved share may go up to 20% over it (owner-configurable), taken from the reserve;
   - never a KCS `transfer` / `approve` / `burn` sent to the app directly (audit-2026-10 A1-07).

   When this route says no (cap reached, function not listed), the station still tries the caller's app plan or pass
   (routes 5 and 6), so a pass holder isn't stranded on a connected app (M-6). A free app can't be sold an app plan.
5. **Calls into an app with an app plan**, under the same per-player limits, never a KCS `transfer` / `approve` / `burn` (AB-008), and never more over a whole term than the plan's daily Mana times the days paid (AB-006).
6. **The payee's own Mana pass**, for anything no app pays for: calls to any contract (also several in one transaction), up to the pass's daily Mana. Never the station, KOIN or stablecoins, never a KCS `transfer` / `approve` / `burn` on any contract, never uploads. Free and paid apps are used first, so a pass isn't spent where an app already pays. (unit "wallet Mana pass"; testnet "pass" section)
7. **Never paid:**
   - token transfers (by anyone, pass or not);
   - mixed-contract transactions from wallets without a pass;
   - unknown apps, for wallets without a pass;
   - anything that would take the station below its safety floor (`admin_min` plus the Mana locked by open tickets, AB-003), except the emergency brake and council votes. A ticket's own transactions need only `admin_min` plus the other tickets' locks, so its paid Mana is always there for it (audit-2026-10 M-1).

A refused transaction costs the player nothing. (A transaction the station agreed to pay that then reverts in a block is charged to the station and counts against the limits by its Mana limit; the terms say so.) Apps and the pass helper ask first with the read-only `would_pay` (same rules, records nothing), so the user signs once: the station when it agrees, their own Mana otherwise (`helper/payer.js` → `sendWithStation`; `helper/mana-station-client.js` → `choosePayer`).

## 3. Integrating Knode and SwarmTales (free play for your own apps)

Neither contract changes. Each one only needs a front-end switch: the station is the payer, and the player is the payee who signs.

### Step 1: connect the app on the station

Do this from the console or with `admin/station-admin.mjs connect`. Both are owner-only.

- **Knode:** `connect_app(Kpred 1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr, N Mana/day, strict = true)`. Then `set_entry` for each player function (answer, settle, claim) with a Mana cap per call. Strict mode means nothing else on Knode gets paid for.
- **SwarmTales Stories:** the same, for each Stories contract players call directly. List its player functions with caps.

### Step 2: point the front end at the station

**Knode, Kondor path** (`knode/site/wallet.js` → `sendKondor`):

```js
const tx = new lib.Transaction({ signer, provider: W.provider,
  options: { payer: STATION, payee: W.address, rcLimit: "19000000" } });   // tight limit: 1.1× a measured action
// better: helper/payer.js sendWithStation asks the station first (would_pay) and falls back to the player's own Mana
```

**SwarmTales** (`swarmtales/web/src/wallet.js` → `signAndSend`). Today it sets `payer: address` with an `rcLimit` of up to 30 Mana. Try the station first:

```js
options: { chainId, payer: STATION, payee: address, rcLimit: TIGHT_LIMIT, sendAbis: false, broadcast: true }
// if refused → the existing own-Mana path, unchanged
```

**Keep `rcLimit` tight.**

- The station charges the limit against the player's daily cap and the app's budget, not the Mana actually used.
- A transaction whose limit is above the function's cap is refused.

Measure each action on the testnet first. The playground's tap uses 0.17 Mana and has a limit of 0.19.

### Step 3: switch off Knode's own sponsor

Once the station is serving Knode, switch off Knode's own sponsor: `set_sponsor_limit(0)` on Kpred, following `docs/notes/knode_sponsor_off_steps.md` in this repo. The Kpred contract then never pays from its own Mana.

### Open questions to check on the testnet before mainnet

- **Kondor and station-paid transactions:** confirm Kondor signs a transaction whose payer is someone else. The playground's buy page builds that case.
- **KOIN Vault:** its `mana: "auto"` path in Knode chooses its own payer. It needs a station option, or it keeps paying as it does today.
- **Multi-contract actions:** if a Stories action calls more than one contract in a single transaction, the station won't pay for it. Split it into separate transactions, or keep it on the player's own Mana.

## 4. Mainnet checklist

- [ ] **Legal:** review the terms (`ALLOWANCE_TERMS` and `BIG_TERMS` in `Station.ts`, which quotes show to buyers).
- [ ] **Council:** 3 wallets on 3 separate devices, ideally held by 3 people (3 to 7 allowed; threshold at least 2 and
  below the size, so one lost key never freezes the council: M-4).
  - Threshold 2, wait 48 hours.
  - The owner wallet is separate from all three.
  - **Plain wallets only** (Kondor or a hardware wallet), never contract accounts: the contract's "called directly" check
    (`direct()`) is what stops another contract from acting with their signatures (audit-2026-10 Info).
  - Keys: decide hardware wallets for the owner and council (open question for Carl).
- [ ] **Treasury address:** decide it. Payments are released to it after each term.
- [ ] **Build** with `NETWORK = mainnet`, which sets the 48-hour minimum wait. CI already builds and checks the mainnet build.
- [ ] **Check the exact file you upload** (AB-007, audit-2026-10 O1-06 / O1-07): tag the release (`release-YYYY-MM-DD`)
  on a clean, committed tree, then `cd contracts/station && npm run check:mainnet -- --release <file to upload>`. It
  refuses a dirty tree or an untagged commit, rebuilds with the pinned protoc 36.2 (checksum-verified per platform),
  and refuses anything that isn't byte-identical. Record its sha256 here and in the council's upgrade notes.
  audit-2026-10 fixes release build (2026-10-23):
  `0c37a13f80f5f852659c8518d21cf3152d32d5d7e973dbf83734e0183dc9ca61` (108,104 bytes); it replaces `7e000287…f855`
  (the audited build), which replaced `c67e1e52…`, `6d391134…` and `f2263538…`. Rebuild and update this line after
  any further contract change.
- [ ] **Preflight (read-only, no key):** `NETWORK=mainnet node admin/preflight-mainnet.mjs > docs/preflight-mainnet.md`.
  It checks that `get_contract_metadata` (system call 112) answers on mainnet (the reserved app slots need it: K1-04 /
  A1-10), vUSDT and vUSDC decimals = 8 (O1-09) and which pause, blocklist or owner powers their ABIs show (M-5), and
  prints the chain's resource prices. Exit code 2 means something to check. Confirm the stablecoins' powers with the
  issuer too.
- [ ] **Measure (M-8, on a local node or the testnet, costs test KOIN):** `NETWORK=testnet STATION=… TOKEN=… OPEN_APP=…
  node admin/measure.mjs --to 49`. It fills a station to 49 open allowances and records `buy_allowance` and the
  `authorize` overhead at each point (MockVM doesn't meter wasm, so the unit-test counts understate cost). Set
  `hard_max` to at least 1.5x the heaviest free-checkout buy, and add the heaviest `authorize` overhead to the site's,
  the helper's and the apps' Mana limits. Record the table here.
- [ ] **Deploy and init in one transaction** (M-12): `NETWORK=mainnet node admin/deploy-station.mjs --wasm
  contracts/station/build/release/contract.wasm --sha256 <the line above> --config <final settings .json>`, first with
  `--dry-run`, after a rehearsal on a local node or the testnet. It refuses a wasm that isn't the published sha256,
  settings with placeholders, a council the contract would refuse, an owner on the council, a wait under 48 hours, a
  station address that already has code or lacks `koin_amount` KOIN or the Mana for the upload; shows everything and
  asks you to type DEPLOY; then reads the code hash, the three permissions and every setting back from the chain.
  The station key asks with a hidden prompt; keep it offline after the deploy.
- [ ] **`open_cap` 50 at launch.** Raise open_cap only after measuring buy_allowance and the heaviest authorize route on a node at the new value. (MockVM system calls: buy_allowance 391 at 50 open, 741 at 100, 1,828 at 255; the heaviest authorize route, an unreserved free app, 77 / 127 / 283; a Mana pass transaction 25, which now reads its terms for the limits they were sold with, AB-032.)
- [ ] **Known limit: renewals can fill the open purchases.** Each allowance may hold up to 8 open terms, and the station
  holds at most 512 open purchases (terms and tickets together); when they are full, every new purchase is refused.
  At `open_cap` 50 allowance terms can reach at most 400, so renewals alone can't fill 512. From `open_cap` 64 up,
  64 one-Mana allowances with 8 one-day terms each can: 512 terms, each paying at least the $0.02 slot fee (passes
  also the $0.25 minimum), covering 8 days: from about **$1.30 a day** with app plans to about $17 a day with passes.
  Keep `open_cap` below 64.
- [x] **Decided (owner, Oct 22): app plans on plain wallets and the near-free squat.** Every allowance now pays the
  slot fee (`slot_fee_per_day`, $0.02 a day proposed), and the last `app_reserved` (10) slots below `open_cap` are
  sold only to app plans whose target is a deployed contract. **Real cost of a squat (Audit Bot AB-023, accepted for
  launch, pricing unchanged):** all 50 slots can be held for about **50 × the slot fee a day** (50 × 2,003,000 base
  units ≈ **$1.00 a day**; about $30 a month on 30-day plans): 1-Mana app plans on the squatter's own wallets fill
  the 40 public slots, and wallets with a tiny contract uploaded at their own address (a few Mana each) fill the 10
  reserved ones. No pass is needed, so the $0.25 pass minimum doesn't raise this. A squat only refuses **new**
  purchases ("too many open allowances"): existing customers keep their service and renewals are never refused.
  **The response is the daily 80% check below**, which shows a squat within a day; then look at who holds the
  slots and raise the slot fee or `open_cap`.
- [ ] **Set** `slot_fee_per_day` 2,000,000 ($0.02) and `app_reserved` 10 (`set_config`, as in
  `config/mainnet.proposed.json`). The mainnet build refuses a slot fee of 0.
- [ ] **Testnet check: "is the target a contract?" (MockVM can't test this).** The contract asks the chain
  (`System.getContractMetadata`); MockVM answers the same for every address, so the unit tests use a stand-in list
  (`testSetContract`). On the playground (testnet build, owner wallet):
  1. `set_config` with the current config plus `open_cap` 12, `app_reserved` 10 (2 public slots), `slot_fee_per_day` 100000.
  2. Buy two 1-day, 1-Mana passes from two test wallets (`get.html` → For my wallet). `get_status` shows `open_allowances` 2.
  3. `quote_allowance` kind 2 → `available` false, reason "the last open slots are kept for app plans on deployed contracts".
  4. `quote_allowance` kind 1 with `target` = a fresh test wallet that never uploaded code → the same reason. Then
     `buy_allowance` kind 1 for that wallet (it co-signs) → refused with **that** reason. Any other error (for example
     the system call reverting for an unknown address) means `isContract` must be fixed before mainnet.
  5. `quote_allowance` kind 1 with `target` = a deployed contract (the demo app from `testnet/playground.json`, or an
     app uploaded with "Upload my app") → `available` true; `buy_allowance` kind 1 for it (the app co-signs) → succeeds.
  6. Note the Mana used by step 5's `buy_allowance` (one extra system call in the reserved zone).
  7. `set_config` back to `open_cap` 50, `app_reserved` 10 and record the result here.
- [ ] **Check daily (open allowances vs `open_cap`):** `STATION=<station address> RPC=<mainnet RPC> node admin/station-admin.mjs check`
  prints open allowances, `open_cap` and `app_reserved` (from `get_status`) and exits with code 2 at 80% of `open_cap`
  or more (40 of 50): then look at who holds the slots (`node admin/station-admin.mjs list`) and decide whether to
  raise `open_cap` (after measuring, see above) or the slot fee. Run it from cron, or by hand once a day.
- [ ] **Prices** (`set_price`) for vUSDT and vUSDC: introductory $0.03 / $0.20 / $0.75 per 1,000 Mana a day; big upload $0.05 per 1,000, minimum 5,000 Mana; Mana pass minimum charge `pass_min_purchase` $0.25 (AB-002). Plus the $0.02-a-day slot fee on every pass and app plan (a config setting, not a price).
- [ ] **Connect Knode and Stories** in strict mode with per-function caps. Then step 3 of section 3.
- [ ] **Watch:** run `node admin/station-admin.mjs check` daily (exit code 2 when Mana is below the alert level or open
  allowances reach 80% of `open_cap`). `get_status.reserve_low` shows the low-Mana state at any time: a
  `reserve_low` event emitted inside `authorize` is lost when that transaction reverts, so don't rely on events alone
  (K1-01, M-7). Invariant: the station's balance of each stablecoin **≥ held + owed** from `get_escrow_totals` (it
  can only be more, by tokens sent to it by mistake).
- [ ] **Release payments:** after terms end, anyone (for example a small cron) calls `release`, then `claim(token,
  treasury)` to move what is owed to the treasury (`node admin/station-admin.mjs claim <treasury>`).
- [ ] **Site (M-11):** a mainnet site needs an origin of its own, not the shared `bawcejawn.github.io` (Carl, Oct 23:
  a free GitHub organisation; its `<org>.github.io`, or a domain later). Set `SITE` in `site/tools/site.config.mjs`;
  `make-site-data.mjs` refuses a mainnet site on the shared origin. Browser test wallets exist only on the testnet.
  Publish only from a clean tree (`publish-pages.sh` refuses otherwise, W1-06). The Owner page offers an upgrade only
  for a tagged release whose build matches the published sha256 (`UPGRADE_TAG`, `UPGRADE_SHA256`, M-10).
- [ ] **CI keys (O1-01, do now):** the old testnet CI artifacts held the playground keys in clear. Run
  `node testnet/genkeys.mjs`, put the new keys in the `TESTNET_KEYS` secret, move the test KOIN over, and delete the
  old workflow artifacts. The workflow no longer writes keys into any uploaded file and refuses to upload anything that
  looks like a key; `npm ci --ignore-scripts` (O1-08).
- [ ] **Real Kondor (W1-11):** run `helper/wallet-helper/test/MANUAL_CHECKS.md` on mainnet with a small pass before the
  helper's store listing.
- [ ] **Test the emergency brake once on mainnet:** a council member pauses, the owner resumes.

## 5. Try it on the playground

Pick your wallet once, top right; every page uses it.

| Page | What to do |
|---|---|
| `get.html` → For my wallet | Buy a Mana pass (Light / Regular / Heavy or custom, 1, 7 or 30 days), then "Test my pass": a call to an app nobody sponsors, paid by your pass. Works from a wallet with no KOIN. |
| `get.html` → For my app | Create a test app, "Upload my app" (ticket, upload, refund of the unused part in one click), then buy an app plan (the app co-signs). |
| `get.html` → Your Mana | Everything the wallet holds, with the refund you'd get now; renew or cancel. |
| `play.html` | Tap as a brand-new player with nothing in their wallet, on the demo app or on your app with a plan. The tap stands in for a real action such as a Knode prediction. |
| `owner.html` | As Owner: give any contract free Mana (Small / Medium / Large or custom), change or remove it; see customers; pause. As a council member: pause, approve, veto, carry out. |

## 6. Paying without changing the app (Oct 21)

Something has to name the station as payer; the chain only asks the named payer. Two ways, both built on `would_pay`:

- **App snippet (covers every user, nothing to install):** `sendWithStation` in `helper/payer.js`. It asks the station first; if the plan is active the station pays, otherwise the user's own Mana pays. When a plan ends the app needs no change.
- **Pass helper (for pass holders, any app):** `helper/wallet-helper/`, an unpacked Chrome extension (version 0.4.0; `node helper/wallet-helper/build.mjs testnet`). It sees a site's signing request to Kondor, asks `would_pay`, and if yes sets payer = station, payee = the user before Kondor opens. Holds no keys, signs nothing, changes only who pays; leaves alone requests with another payer (Kondor free mana, app sponsors) or existing signatures; stands aside 2 minutes after a refusal. Tests: `helper/wallet-helper/test/` (node, Python and Chromium checks; see its AUDIT.md). A careful site can tell the helper is installed (W1-02); it can't read or answer its questions.
- **Kondor and this testnet:** Kondor's public code knows only mainnet and the older Harbinger testnet (chain id `EiBncD4p…`), so on this testnet the playground's helper page uses a stand-in wallet that answers signing requests the way Kondor does. Real-Kondor testing happens on mainnet.

## 7. Later: wallets (not before the station is proven with Knode and SwarmTales)

- **Phones:** apps that add the station check cover everyone, pass holders included, in any browser. A wallet-level
  option is the only way to cover passes in apps that don't.
- **KOIN Vault** (koinvault.app, passkey phone wallet, someone else's): Carl may offer a pull request adding a
  "pay with Mana Station when it agrees" option, using `would_pay` (helper/mana-station-client.js).
- **Kondor:** same idea, much later; no contact until then (Carl, Oct 21).

## 8. audit-2026-10: accepted findings and why

Everything else in the report is fixed on `audit-2026-10-fixes`, with a test where a test can show it. These stay as
they are, on purpose:

| Finding | Why it stays | What covers it |
|---|---|---|
| K1-03 / V-9: a tiny contract at a wallet's own address passes the reserved-slot check | Only price protects the reserved slots; the squat costs about $1 a day (AB-023, accepted Oct 22). It refuses new purchases only; existing customers and renewals are never affected. | Daily `station-admin.mjs check` (80% of `open_cap`), then raise the slot fee or `open_cap`. |
| A1-10 / K1-04: system call 112 may be missing on mainnet | Can't be fixed in the contract; it's a chain question. Without it, app-plan buys in the reserved zone revert; passes and the public slots still work. | `preflight-mainnet.mjs` checks it before launch. |
| D-04 / K1-02: pending sponsored transactions hold their full Mana limit in a node's mempool | Chain behaviour. | Tight Mana limits in the site, helper and apps (measured with `measure.mjs`). |
| A1-05: `authorize` can be called as an ordinary entry point | The payee must still sign, so a caller only touches its own records. | — |
| A1-06: "24 h" windows are four 6-hour blocks (and 24 hourly ones), so up to 2x the daily amount fits in one 24-hour span | 1x on average and never more than daily amount x days over a term; exact rolling windows would cost far more storage per call. | Stated in the on-chain terms and on the terms page. |
| A1-07 / D-05: a contract the user calls may move tokens on station Mana | What an app does inside is up to the app. A direct KCS `transfer` / `approve` / `burn` is refused on the free-app, app-plan and pass routes (free apps since this audit); free checkout allows only the buyer's `approve` to the station. | Terms say so; strict mode for connected apps. |
| D-07: tickets and quotas are charged by the Mana limit, also when the user's transaction reverts | `authorize` runs before execution and can't see the result. | Terms say so; tight limits. |
| E1 / Info: the pass route has no per-minute rate limit | A pass is paid, and its daily Mana bounds it. | — |
| Info: per-user limits key on the payee only; the operator route repeats the chain's payee check | The payee is the signer the chain checks; the repeat is harmless. | — |
| Info: the operator route sits outside the Station-wide window | Owner and council are trusted roles, still under per-user limits and the floor (only council brake and votes go below it). | — |
| Info: ticket refunds can round down by up to 1.98 base units | Rounding always favours the station, never creates value. | Fuzz invariant `balance = held + owed`. |
| Info: a suspended (abuse, AUP, legal) wallet's renewal on **someone else's** allowance isn't refunded | That term serves the other wallet, who did nothing wrong; refunding it would cut their service. Sanctions are different: it's frozen until the council decides (M-3). | — |
| Info: `direct()` is stricter than the SDK helper, and load-bearing | Intended: it is what stops a relayed call using an operator's signature. | Owner and council must be plain wallets (section 4). |
| Info: resume's cost was never measured | It's a single owner call, paid by the station or by the owner. | Measure it in the mainnet rehearsal with the other admin calls. |
| Info: big uploads stop at about 460 KB, not the 1 MiB buffer | Chain transaction limits. | Comment in `Station.ts`; the buffer is headroom. |
| W1-02: a careful site can tell the helper is installed | Can't be hidden from a page that inspects its own functions; it still can't read or answer the helper's questions. | STORE.md and the privacy notice say so. |
| W1-07 (part): CSP keeps `'unsafe-eval'` | koilib's protobuf code needs it (checked in Chromium). The CDN sources are now the two exact pinned files, with SRI; `'self'` becomes safe with the site's own origin (M-11). | — |
| W1-08: the helper keeps a site's Mana limit up to the station maximum | Carl, 0.3.1: bigger transactions need their room. One day of the pass is the most a hostile site can spend; the user approves every transaction. | Helper AUDIT.md. |
