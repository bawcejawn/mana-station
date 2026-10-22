# Mana Station: who can do what, and how to launch

Status on 2026-10-20 (branch `fix/squat-freeze-stall`, PR #1):

- **Unit tests:** 76 of 76 pass (`contracts/station/assembly/__tests__/Station.spec.ts`), including wallet passes and free checkout; every new rule is mutation-checked.
- **Testnet:** `testnet/run_tests.mjs` (now also covers passes and free checkout).
- **Playground:** station v3 (`1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc`) is live on the Koinos testnet and handed over to Carl's wallets (owner + council 1–3).
- **Three ways in (Oct 20):** a **Mana pass** for a wallet, an **app plan** for a contract, and **free Mana** the owner gives their own apps. A wallet with no KOIN and no Mana can buy, renew and cancel (free checkout).
- **Not done yet:** mainnet deployment, a legal review of the terms, and a domain.
- **Audit Bot audit (2026-10-22, commit 4343f83):** fixes on branch `audit-fixes-1` (AB-001 … AB-022). Unit tests: 78
  original + 51 audit proof tests + 30 regression tests (159), all pass. The rules below are updated to match.

## 1. Access: who can do what

"Signs" means the chain's `check_authority` for that address passes. For a wallet that means its key signed. For a contract it means its own `authorize` said yes.

**Called directly (AB-004):** the owner, council members, buyers and payers must also call the station themselves: as a
top-level operation of their transaction, or from their own contract. A call relayed by some other contract they happened
to sign a transaction for is refused, even though their signature is on the transaction. The station itself is never
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
| `cancel_allowance` / `cancel_big_upload` | The buyer. A buyer cancel charges the days used at the 1-day price for that size (AB-010). A suspended buyer can't self-cancel (the unused share was already refunded at suspension; sanctions: frozen). | unit escrow and refund tests; audit "rt-thief-tier-arbitrage"; testnet "suspended buyer cannot self-cancel" |
| `close_ticket` after expiry, `release` after a term ends | Anyone. The money only ever goes to the treasury or back to the buyer. | unit "release before the end refused even for the owner" |
| Limit per wallet | At most 5 open allowances and tickets together, counting allowances **for** the wallet too (AB-002). Station-wide, Mana sold decides whether a new allowance fits, up to `open_cap` open allowances (owner setting, 1 to 256, proposed 50; renewals are never refused by it), with fixed safety caps of 256 open allowances and 512 open purchases. Mana passes cost at least `pass_min_purchase` ($0.25 proposed). | unit "one wallet's open allowances…"; audit "squat", "fixes-1" |

### Owner (day-to-day operator)

| Action | Who | Tested in |
|---|---|---|
| Connect, change or disconnect a free app (`connect_app` / `disconnect_app`, `set_exempt`); per-function caps (`set_entry`) | Owner. Refused for KOIN and stablecoins (AB-009) and for a contract with a live paid allowance (AB-001). | unit "connected apps"; audit "exemptmoney", "silent-denial"; testnet connect, list and disconnect |
| Owner boosts (`set_app` boost) | Owner. All active boosts together at most `buffer_bp` of the daily budget (AB-003). | audit "boost-ticket", "fixes-1" |
| Prices (`set_price`), `owner_refund` (never for the operators' own purchases) | Owner | unit suspension and L4 tests |
| Suspend or unsuspend a buyer | Owner. Reasons 1, 3, 4 (abuse, AUP, legal) **refund the unused share automatically** when the suspension starts (whole unused days pro rata, the unexpired unused share of a ticket, no minimum or fee kept); the owner keeps only what was served. Reason 2 (sanctions) freezes refund and release. (AB-001) | unit "suspension (AB-001)"; audit "verify-suspend-confiscate", "fixes-1" |
| `set_config`: limits only | Owner. **Refused** for the owner, treasury, council, threshold or delay, and for any higher ticket fee. Those all go through the council. Also refused (AB-001): a ticket lifetime outside 1 hour to 7 days, `hard_max` below 1 Mana, `admin_min` above 10% of `koin_amount`, `max_ops` below 2, per-user limits of 0 or a daily per-user Mana below `hard_max`. `max_allowances` is ignored. | unit "operators: … money settings need the council"; audit "rt-ins-ticket-lifetime", "rt-ins-silent-denial" |
| Resume after a pause | Owner | same |

### Council (2 of 3 on the playground)

| Action | Who | Tested in |
|---|---|---|
| Pause the station (emergency brake) | The owner or **any one** council member | unit "operators"; testnet operators section |
| `propose` a guarded action, `approve` it | Council members | unit "audit #1" block; testnet council section |
| Veto (`cancel_proposal`) during the wait | **Any one** member. Exception: a member can't veto their own removal. A vetoed action (an upgrade by its code hash, anything else by its exact contents) can't be proposed again for **14 days**, whoever sits on the council then (AB-011). So 2 of 3 can still replace the vetoing member and pass the change, but only after at least 14 days plus the wait. | unit "veto" and "H1"; audit "rt-ins-council-veto", "fixes-1" |
| `execute` once approved and the wait has passed | Anyone | unit "KOIN withdrawal: 2 of 3, then 48 h" |

**Guarded actions:** upgrading the code, withdrawing KOIN, rescuing a token sent by mistake, changing the council, the waiting period, the treasury or the owner, and raising the ticket fee.

- **Wait:** at least 48 hours on mainnet (2 minutes on the playground), at most 30 days.
- **Cap:** each member can have at most 3 proposals open at a time.
- **Council change:** restarts the wait on every open proposal.
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

0. **Free checkout:** a wallet's own `approve` (to the station, in a priced stablecoin) plus `buy_allowance` / `buy_big_upload` / `renew` with that wallet as buyer, or a single `cancel_allowance` / `cancel_big_upload` by the buyer. Per-player limits apply. Buys are refused while paused; cancels aren't. (unit "free checkout"; testnet "checkout" section)
1. **Calls to the station itself, from the owner or a council member.** Allowed for admin and votes, even while paused, within the same per-minute and per-day limits as players. Only `set_paused` and council votes / vetoes (`approve`, `cancel_proposal`) may be paid below the safety floor (down to the transaction's own limit); every other admin transaction keeps the floor like all paying routes (AB-012).
2. **Paused:** nothing else is paid for.
3. **A big-upload ticket holder:** uploading or calling *their own* contract, up to the ticket's Mana, for 24 hours.
4. **Calls into one connected free app:**
   - only that app in the transaction;
   - per-function caps, or listed functions only in strict mode;
   - per-player limits: a few actions a minute (10 on the playground), then a pause, one per block, and a daily cap that is smaller for new players;
   - the app's daily amount; an app with a reserved share may go up to 20% over it (owner-configurable), taken from the reserve.
5. **Calls into an app with an app plan**, under the same per-player limits, never a KCS `transfer` / `approve` / `burn` (AB-008), and never more over a whole term than the plan's daily Mana times the days paid (AB-006).
6. **The payee's own Mana pass**, for anything no app pays for: calls to any contract (also several in one transaction), up to the pass's daily Mana. Never the station, KOIN or stablecoins, never a KCS `transfer` / `approve` / `burn` on any contract, never uploads. Free and paid apps are used first, so a pass isn't spent where an app already pays. (unit "wallet Mana pass"; testnet "pass" section)
7. **Never paid:**
   - token transfers (by anyone, pass or not);
   - mixed-contract transactions from wallets without a pass;
   - unknown apps, for wallets without a pass;
   - anything that would take the station below its safety floor (`admin_min` plus the Mana locked by open tickets, AB-003), except the emergency brake and council votes.

A refused transaction costs the player nothing. Apps and the pass helper ask first with the read-only `would_pay` (same rules, records nothing), so the user signs once: the station when it agrees, their own Mana otherwise (`helper/payer.js` → `sendWithStation`; `helper/mana-station-client.js` → `choosePayer`).

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

Once the station is serving Knode, switch off Knode's own sponsor: `set_sponsor_limit(0)` on Kpred, following `knode_sponsor_off_steps.md` in this repo. The Kpred contract then never pays from its own Mana.

### Open questions to check on the testnet before mainnet

- **Kondor and station-paid transactions:** confirm Kondor signs a transaction whose payer is someone else. The playground's buy page builds that case.
- **KOIN Vault:** its `mana: "auto"` path in Knode chooses its own payer. It needs a station option, or it keeps paying as it does today.
- **Multi-contract actions:** if a Stories action calls more than one contract in a single transaction, the station won't pay for it. Split it into separate transactions, or keep it on the player's own Mana.

## 4. Mainnet checklist

- [ ] **Legal:** review the terms (`ALLOWANCE_TERMS` and `BIG_TERMS` in `Station.ts`, which quotes show to buyers).
- [ ] **Council:** 3 wallets on 3 separate devices, ideally held by 3 people.
  - Threshold 2, wait 48 hours.
  - The owner wallet is separate from all three.
- [ ] **Treasury address:** decide it. Payments are released to it after each term.
- [ ] **Build** with `NETWORK = mainnet`, which sets the 48-hour minimum wait. CI already builds and checks the mainnet build.
- [ ] **Check the exact file you upload** (AB-007): `npm run check:mainnet -- <file to upload>` rebuilds the release and
  refuses anything that isn't byte-identical (a `build:sim` test build now goes to `build/sim/`). Record its sha256 here
  and in the council's upgrade notes. audit-fixes-1 release build (2026-10-22):
  `b624f2003c1431c1439c0c6a24174bfe8d3b6d7a8fe2abcea8e4f36847b9c8dc` (92,937 bytes). Rebuild and update this line after any further contract change.
- [ ] **Deploy and init in one transaction:** upload with all three permissions plus `init`, exactly as `testnet/playground.mjs deploy` does. Fund the station's KOIN first.
- [ ] **`open_cap` 50 at launch.** Raise open_cap only after measuring buy_allowance and the heaviest authorize route on a node at the new value. (MockVM system calls: buy_allowance 391 at 50 open, 741 at 100, 1,826 at 255; the heaviest authorize route, an unreserved free app, 77 / 127 / 283.)
- [ ] **Known limit: renewals can fill the open purchases.** Each allowance may hold up to 8 open terms, and the station
  holds at most 512 open purchases (terms and tickets together); when they are full, every new purchase is refused.
  At `open_cap` 50 allowance terms can reach at most 400, so renewals alone can't fill 512. From `open_cap` 64 up,
  64 one-Mana passes with 8 one-day terms each can: 512 terms at the $0.25 pass minimum = $128, covering 8 days,
  about **$16 a day**. App plans pay only `min_purchase` (0 in the proposal), so the same with plans costs far less
  (see the open question on app-plan targets). Watch `get_status` / `list_connected` and keep `open_cap` below 64
  until this is decided.
- [ ] **Open question: app plans on plain wallets.** An app plan's target only has to sign, so a wallet with no
  contract can be a target. Such a plan sponsors nothing but still takes one of the `open_cap` slots, and app plans pay
  `min_purchase` (0 proposed), not the $0.25 pass minimum: 50 one-Mana, 1-day plans cost about $0.0015 and would fill
  `open_cap` 50 for a day. Before launch, choose one: set `min_purchase` (plans and tickets) to $0.25 too, apply the
  pass minimum to app plans, or require the target to be a contract (`get_contract_metadata` on chain; MockVM can't
  test it).
- [ ] **Prices** (`set_price`) for vUSDT and vUSDC: introductory $0.03 / $0.20 / $0.75 per 1,000 Mana a day; big upload $0.05 per 1,000, minimum 5,000 Mana; Mana pass minimum charge `pass_min_purchase` $0.25 (AB-002).
- [ ] **Connect Knode and Stories** in strict mode with per-function caps. Then step 3 of section 3.
- [ ] **Watch** for `reserve_low` events, and for escrow totals equal to the station's token balance (`get_escrow_totals`).
- [ ] **Release payments:** after terms end, anyone (for example a small cron) calls `release`.
- [ ] **Site:** choose the domain; add the canonical and og:url tags and the sitemap host. Point the console at mainnet.
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

Old links (`buy.html`, `console.html`, `how-it-works.html`) forward to the new pages.

## 6. Paying without changing the app (Oct 21)

Something has to name the station as payer; the chain only asks the named payer. Two ways, both built on `would_pay`:

- **App snippet (covers every user, nothing to install):** `sendWithStation` in `helper/payer.js`. It asks the station first; if the plan is active the station pays, otherwise the user's own Mana pays. When a plan ends the app needs no change.
- **Pass helper (for pass holders, any app):** `helper/wallet-helper/`, a userscript and an unpacked Chrome extension built from the same code (`node helper/wallet-helper/build.mjs testnet`). It sees a site's signing request to Kondor, asks `would_pay`, and if yes sets payer = station, payee = the user before Kondor opens. Holds no keys, signs nothing, changes only who pays; leaves alone requests with another payer (Kondor free mana, app sponsors) or existing signatures; stands aside 2 minutes after a refusal. Offline rule tests: `helper/wallet-helper/test/test_helper.py` (9/9).
- **Kondor and this testnet:** Kondor's public code knows only mainnet and the older Harbinger testnet (chain id `EiBncD4p…`), so on this testnet the playground's helper page uses a stand-in wallet that answers signing requests the way Kondor does. Real-Kondor testing happens on mainnet.

## 7. Later: wallets (not before the station is proven with Knode and SwarmTales)

- **Phones:** apps that add the station check cover everyone, pass holders included, in any browser. A wallet-level
  option is the only way to cover passes in apps that don't.
- **KOIN Vault** (koinvault.app, passkey phone wallet, someone else's): Carl may offer a pull request adding a
  "pay with Mana Station when it agrees" option, using `would_pay` (helper/mana-station-client.js).
- **Kondor:** same idea, much later; no contact until then (Carl, Oct 21).
