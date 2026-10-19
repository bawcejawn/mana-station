# Mana Station: engineering design (v0, 2026-10-19)
Design only. Nothing was deployed, signed or broadcast, and nothing was spent. Tags: **VERIFIED** (source or live read, cited), **EST** (my estimate), **UNVERIFIED**.
Key sources: koinos-chain `src/koinos/chain/system_calls.cpp` (`apply_transaction`, about L384–520) and `controller.cpp` (`submit_transaction`, about L880–1055) @0ae99ec · docs https://docs.koinos.io/developers/payer-payee/ and `/developers/authority/` · freemanasharer https://github.com/joticajulian/freemanasharer (`Freemanasharer.ts`) · Knode https://github.com/bawcejawn/Knode @6782ccf · SwarmTales https://github.com/bawcejawn/Swarmtales @bf67121 · KOIN Vault https://github.com/therexdev/koin-vault (`docs/website-integration.md`).

**Coverage check:**
- Orchestrator items 1–5 are in §1–§5.
- The Designer's VERIFY 1–7 and the design.md VERIFY items are in "VERIFY answers".
- The instant play account is in §4(A).
- The approved-contracts-only, no-transfer check list is in §2.
- Carl's phase-1 decisions are in §6.

## 1. How payer and authorize work
- **Header.** The header holds `payer` and an optional `payee`. The payer's Mana pays. If a payee is set and differs from the payer, the payee's nonce is used, and **both payer and payee must authorize** the transaction (docs payer-payee; `apply_transaction`). VERIFIED.
- **Contract payer.** When the payer account has a contract with the `transaction_application` override, the chain calls its `authorize(type=1)` in place of a signature check. That call runs **inside the payer's Mana session**: its compute counts against the transaction's `rc_limit` and is billed to the payer. VERIFIED.
- **What authorize can see.** It can read the whole transaction through `System.getTransactionField` (`header.rc_limit`, `header.payee`, `operations`), and it can call `System.checkAuthority`. Kondor's @freemanasharer and Knode's `sponsorOk` both work this way. VERIFIED.
- **Paying for calls into other contracts: YES.** Nothing ties the payer to the contracts being called. Example: freemanasharer pays for calls into the KOIN contract and other contracts (24-hour mainnet scan, feasibility report §M). VERIFIED. The payer's only tool is to *inspect* the operations and accept or refuse.

## 2. Phase 1: Carl's own sponsor ("station")
**Account model.** Use a **new, separate account**, not Carl's main wallet. Upload the station contract to it with **only** the `transaction_application` override switched on.
- Carl's key keeps the default signature control over `contract_call` (withdrawing KOIN) and `contract_upload` (upgrades or kill), so custody stays with Carl. Mana comes from KOIN held at the station address.
- Uploading to his main wallet would also work technically. But every transaction where he is the payer would then go through `authorize`, and his own transactions would need a key-check path, so a separate account is cleaner. EST.
- Nothing conflicts with Kondor's free-mana feature or with KOIN Vault. Their sponsors are separate accounts.

**Exact checks in `authorize(args)`.** Return false (don't throw) on any failure:
1. `args.type == transaction_application`; anything else → false. The station never approves outside token moves.
2. `paused == false`.
3. `payee = getTransactionField("header.payee")` must be present and must not be the station itself. Without this, the station's own nonce is used and anyone could spend its Mana with no user signature. This is the freemanasharer rule.
4. `rc_limit <= ep_cap[contract][entry_point]`, the per-action cap from §6 (hard maximum 3 Mana).
5. `ops = operations`, and `1 <= ops.length <= MAX_OPS` (1 or 2). Every op must be `call_contract`. Reject `upload_contract`, `set_system_call` and `set_system_contract` (op kinds in koinos-proto `protocol.proto`).
6. Each `call_contract.contract_id` must be in `allow[contract]`, and its `entry_point` in that contract's allowed set. The KOIN, VHP and any token contract are **never** allowlisted, so no transfer, approve or burn can be sponsored. Optional: `args.length <= max_args` against oversized payloads.
7. Per-user limits over a **rolling 24 h window** (4 buckets of 6 h): `actions_24h + 1 <= limit` and `mana_24h + rc_limit <= mana_limit`. Also 1 per block, 5 per minute, and a cooldown (§6).
8. Floor and app share (dynamic, §6): `System.getAccountRC(station) - rc_limit >= floor`, and `app_today + rc_limit <= app_share`. There is no fixed station-wide cap.
9. If all checks pass, increment the counters and return true.

**Nested calls.** `authorize` sees only the top-level operations. What an allowlisted contract does inside (calls to tokens or other contracts) is decided by that contract's code. Two rules follow:
- (a) Allowlist only Carl's own audited contracts. Never allowlist a contract with a generic "execute or forward" entry point.
- (b) The station's KOIN is still safe: moving it needs the station's `contract_call` authority, which the station refuses. The user's tokens need the user's authority, which the chain checks separately.

**Anti-spam:** see VERIFY 5. Rejected transactions cost the station nothing. Accepted transactions that later revert are charged, but they are bounded by checks 4, 7 and 8. Server-side pre-filtering protects *availability*, not Mana.

## 3. Knode: why `payer` is never set, and the fix
- **Why.** In `site/wallet.js`, `sendKondor` builds `new lib.Transaction({ signer, provider })` with no `options.payer`, so koilib defaults the payer to the signer (the user). `sendVault` sends only `{operations, mana:"auto"}`, and the Vault API has no payer field. So `Kpred.sponsorOk` (game/assembly/Kpred.ts about L1019) never runs. VERIFIED.
- **The 2 KOIN cap.** `max_sponsor_rc = 200000000` (2 KOIN of Mana) on chain (game-data/deployment.json). The code caps it at 10 KOIN. Sponsorship covers only one-op `answer`, `settle` or `claim` by **staked** players. 2 Mana is enough for a typical answer (~1.1–1.9 Mana), so the cap isn't the blocker. The missing payer is. VERIFIED.
- **Honesty catch.** Knode's own payer is the pool contract, so the Mana comes from pooled KOIN and locks it until it refills. Recommendation: set the cap to 0 and use Carl's station.
- **Minor.** The `settle` path doesn't require a payee, so a sponsored settle uses the pool's own nonce. Low risk, but worth fixing in the next upgrade. EST.
- **Fix (Kondor path):** `new Transaction({signer, provider, options:{ payer: STATION, payee: W.address, rcLimit: cap }})`, then the user signs. The station needs no signature. **UNVERIFIED:** whether Kondor's signer keeps a pre-set payer or swaps in its free-mana payer. This needs a testnet check (Carl's OK).
- **Knode and SwarmTales are separate.** Separate repos with separate contracts. SwarmTales (Ink, Shop, Stories) is undeployed and has no sponsor code by design ("separate Sponsor contract, OFF by default", README). Each site needs its own wiring, but both can use one shared helper (`sponsor(tx)`).

## 4. Mobile: KOIN Vault and a play account
**Vault facts (VERIFIED, docs/website-integration.md):**
- The dApp API takes `operations` plus `mana: auto|wallet`. There is **no custom payer** field and no "sign only" endpoint. Vault prepares, signs and submits the transaction itself.
- Vault's own sponsor covers only native KOIN/VHP operations and supported PoB operations. **Custom contracts (Knode, SwarmTales) are self-paid.**
- Ceilings: 20 Mana for one native operation and 100 Mana otherwise. Daily limits: 5,000 shared, 500 per account, 1,000 per origin.
- So a relayer **can't** wrap Vault signatures: they are passkey smart-account signatures inside a transaction Vault itself submits.

**Options:**
- **(A) Play account, recommended.**
  - The browser generates a secp256k1 key (koilib `Signer`) on first tap and keeps it in IndexedDB. WebCrypto has no secp256k1, so the raw key bytes sit in storage. Optionally they can be encrypted with a key derived from a passkey (WebAuthn PRF; browser support UNVERIFIED).
  - The site builds each transaction with `payer = station`, `payee = play address`, and the key signs. This works the same as the Kondor fix, with no wallet needed.
  - Recovery: "Back up" exports the key or a phrase. Clearing browser storage without a backup loses it.
  - Security: XSS or a malicious extension can steal it, so keep only low-value items on it.
  - Honesty: the key is the user's and never leaves the device. Never call it "your wallet" if a server ever holds a copy. An optional encrypted server backup must be disclosed.
  - Upgrade: (1) **Move to my wallet**, an allowlisted transfer of game items to a Vault or Kondor address; or (2) **link**, an app-contract `link(play, real)` call that requires both authorities. Vault's half is self-paid, a small one-off cost.
- **(B) Relayer with a session key.** The Vault user approves one `register_session(key, expiry, scope)` call in the app contract (self-paid). After that, the play key acts within that scope with `payer = station`. This adds contract work, and the user must hold a little KOIN once.
- **(C) Ask KOIN Vault for a `payer` option.** Free, but the timing isn't under our control. Do A now, file C, and treat B as optional.
- **Fully custodial server keys:** don't do this (honesty and liability).

## 5. Phase 3: non-custodial provider registry (sketch)
- Each provider deploys **their own** station contract from the audited template to their own account, keeps their key, and funds it. The registry contract only stores `{station, owner, fee_terms, served_apps, paused}`, plus the template code hash. Listing requires a matching hash and the upload override switched on (the Fogata-2 "fingerprint" pattern). The registry holds no funds.
- **Fees without custody:** apps pay KOIN **directly to the provider's station address**. That also adds Mana. The station records `paid_until[app]` itself, and its allowlist check also requires `paid_until[app] >= now`.
- An operator cut, if any, is a second transfer in the same transaction straight to the operator. No pooled escrow or splitter that holds a balance. Per-use billing is out of scope for v0; do monthly only.
- Framing: a service fee, not yield (Monetization to confirm).

## 6. Phase 1 as decided by Carl: a dedicated 30,000 KOIN station with a dynamic budget
> **Superseded in part by §7 (v2 model, 4:13 PM):** the 6,000 floor, the 50/50 refill shares and the app-share rules are replaced. The per-user anti-spam rules, the admin paths, the payer helper and the Kondor notes still apply.
**Station wallet (decided: YES).** A new account holds the 30k KOIN and stays in Carl's holdings. The owner key is kept offline. The contract upload switches on only the `transaction_application` override (§2).

**Mana locks KOIN (VERIFIED in koinos-contracts-as `koin/assembly/Koin.ts`, around L195–220,):**
- `transfer` requires `balance >= value` **and** `mana >= value` ("insufficient mana for transfer"), then subtracts `value` from both the sender's balance and its Mana. The Mana moves with the KOIN.
- Regeneration is linear: `mana += Δt × balance / 432,000,000 ms`, capped at `balance`. That is 20% of the balance per day; a full refill takes 5 days.
- So **the station can withdraw at most its current Mana**. KOIN whose Mana sponsorship has spent stays locked until that Mana refills. Example: at 6,000 Mana, at most about 6,000 KOIN can move right now.
- To be checked: I read the source repo, not the deployed bytecode at `19GYj…` (UNVERIFIED match). The docs say the same thing (docs: Mana).

**Can `authorize` read the station's own Mana? YES (VERIFIED).**
- `System.getAccountRC(account)` wraps the `get_account_rc` system call (koinos-sdk-as `assembly/systemCalls.ts` L316). Kondor's freemanasharer already calls `System.getAccountRC(this.contractId)` inside its `authorize` (`getAvailableMana()` in its source).
- It returns the Mana as it stood before the current transaction is charged, and the chain applies charges one transaction at a time. So the check is `getAccountRC(station) - rc_limit >= floor`.
- Two limits: it can't see the mempool's pending reservations, and a transaction can still use up to its full `rc_limit`. Both are covered because the floor is far larger than one transaction.

**Dynamic budget (replaces the fixed 3,000/day ceiling):**
- **Floor: 6,000 Mana (20% of 30k, one day's refill).** Sponsorship is refused once `mana - rc_limit` would fall below it. Reasoning:
  - (1) Admin, kill-switch and withdrawal transactions need under 50 Mana; a code upgrade needs about 25. The floor covers them more than 100× over.
  - (2) At least about 6,000 KOIN can always be withdrawn instantly.
  - (3) It leaves 24,000 Mana of burst room, about 9,600 actions at 2.5 Mana, before the station falls back to its refill rate of about 250 Mana/hour.
  - (4) It never empties, so used Mana never locks more than 80% of the KOIN.
  - It supersedes BUILD_PLAN's 70% auto-pause (21k). That would leave only 9k of burst room. Keep 50% (15k) as an *alert* for Carl, not a pause. If Carl wants more KOIN liquid at all times, raise the floor (e.g. 15k). Burst room shrinks one-for-one.
- **Station-wide spend is bounded by app shares, not a cap.** Each app gets a daily share, and the shares add up to at most 100% of the daily refill (`0.2 × balance`, computed live from `balance_of(station)`). Start with Knode 50% and SwarmTales 50%, i.e. 3,000 Mana/day each at 30k. The station therefore never spends more than it refills over a day. Spending below the floor is impossible.

**Anti-spam rules (all enforced in `authorize`; one record per user, overwritten in place to keep disk cost low):**
| Rule | Value | Note |
|---|---|---|
| Per user per block | 1 sponsored tx | Uses `getBlockField("header.height")` |
| Per user per minute | 5 txs | Breaking it → **10-minute cooldown** (`cooldown_until`) |
| Per user, rolling 24 h | 25 actions and 60 Mana | 4 buckets × 6 h; charged at `rc_limit` (conservative) |
| New account (first sponsored tx under 24 h ago) | 10 actions and 25 Mana on its first day | Play accounts are new addresses, so the same rule applies (the contract can't tell them apart) |
| All new accounts together, per app | ≤ 25% of the app's daily share | The real defence against throwaway accounts |
| Daily-cap hit | Refused until the oldest 6 h bucket leaves the window (≤ 24 h + 6 h) | No 00:00 UTC reset, no permanent bans |
| Kill switch | Owner `set_paused(true)` | Paid by the owner wallet's own Mana, or by the station above the floor |
- Off-chain, the app adds per-IP and per-device limits and a captcha after repeat hits. This is for uptime only; rejected transactions cost no Mana (VERIFY 5).

**Per-transaction `rc_limit` matches what the station offers.**
- Each allowlisted entry point gets `ep_cap = measured max cost + authorize overhead + 10%`. The station refuses anything above `ep_cap`, and the helper sets exactly `ep_cap`.
- Until the testnet measurement: Knode-type calls observed ≤ 1.9 Mana, plus authorize EST ≤ 1.0 Mana, gives **ep_cap 3.0 Mana**. 3.0 is also the hard maximum.
- `rc_limit` is only a ceiling. The real cost is about 1.25–2.5 Mana per action.

**Admin path.** Withdrawals and the station key's own transactions arrive with `payer == station` and no payee, or with the station as payee. In that case `authorize` allows them only if the transaction is signed by the station key: `System.checkAuthority(contract_call, station)`, which is a plain signature check because `contract_call` isn't overridden. This needs a testnet check.

**Carl's decisions (2026-10-19, 3:48 PM):** a rolling 6,000 floor; rolling 24 h allowances; a 50/50 Knode/SwarmTales split that is configurable; testnet OK; Knode's `set_sponsor_limit(0)` only after the station is fully launched and the apps use it.

**Real contract (replaces the pseudocode):** `contracts/station/assembly/Station.ts` (koinos-sdk-as 1.5.1).
- Release build `build/release/contract.wasm` is 23,620 bytes; the ABI is `abi/station.koilib.json` (authorize entry point 0x4a2dbd90).
- Test app: `contracts/testapp/`, with `play`, `heavy`, `nope`, `boom` and `get`, 10,580 bytes.
- Rules exactly as in the table above. Everything is configurable by the owner with no redeploy: `set_config` (floor, limits, cooldown, refill %), `set_app` (add apps, change shares) and `set_entry` (allowlist plus per-action cap).
- **Rolling floor:** `authorize` refuses unless `getAccountRC(station) - rc_limit >= floor`. Sponsorship can only spend Mana above 6,000, so the station's Mana always rebuilds from at least 6,000 toward full at about 20% of the balance per day.
- **Rolling 24 h: feasible, and it's built.**
  - Users: a ring of 4 × 6 h buckets. Apps: 24 × 1 h buckets.
  - Measured record sizes after a day of use: user record 55 bytes, app window 219 bytes.
  - Disk is charged on the **size change** only. Overwriting a key charges `new size − old size`, and only a new key pays for the key bytes (koinos-state-db-cpp `state_db.cpp` `put_object`; koinos-chain `system_calls.cpp` L1043–1055 → `resource_meter::use_disk_storage`).
  - A user's first record costs about (55 + ~60 key) bytes × 61,770 rc/byte ≈ **0.07 Mana once**. Later updates cost almost nothing on disk (a few bytes of varint growth). That's about 0.01 Mana more than a UTC-day counter, so the UTC day is dropped.
  - Granularity: an allowance comes back 18–24 h after use, not at 00:00 UTC.
- **Design change: cooldown vs rollback.** A refused transaction rolls back every write, so a cooldown stored on refusal would vanish. The contract instead sets `cooldown_until` in the **accepted** transaction that uses the last per-minute slot (the 5th), so it persists. The off-chain limiter is now optional.
- **Admin paths:**
  - (1) No payee, or payee = station: allowed only with the station key's signature. This covers withdrawals and setup.
  - (2) Every operation calls the station itself, payee = owner, signed by the owner, `rc_limit ≤ hard_max`: allowed **even while paused and below the floor**. This is the kill switch and unpause.
  - Everything else must pass the full rules.

**Local test results (MockVM simulated chain, `npm test`, 11/11 pass; a mutation check confirmed the tests catch broken rules).** These test the logic only. **Mana costs need the testnet.**

| Check | Result |
|---|---|
| Approved call sponsored | PASS |
| KOIN transfer, unapproved contract, unapproved entry point, upload op, approved + upload mix, two apps in one tx, > max_ops, oversized args | PASS (all refused) |
| `rc_limit` above the action cap / hard max | PASS (refused) |
| `contract_call` / `contract_upload` authority on the station | PASS (refused) |
| Floor via the station's Mana (just below → refused, exact → accepted) | PASS |
| 1 per block; 5 per minute → 10-minute cooldown written by the accepted 5th tx; other users unaffected | PASS |
| New user 10 actions on day one; then 25 per rolling 24 h; 60 Mana cap; allowance returns after the window rolls | PASS |
| App share 50/50 from the refill; new-user pool 25%; other app unaffected; app added with 0% gets nothing | PASS |
| Pause stops sponsorship; owner can unpause with station Mana while paused and below the floor; non-owner and over-hard-max refused | PASS |
| Station-own tx needs the station key | PASS |
| **Testnet: deploy, real costs, refusals cost 0, Kondor payer** | **BLOCKED (rechecked 4:05 PM: 6 Harbinger endpoints, all TLS-fail from the box; outside fetch 484/504; Carl's 50 tKOIN to funder can't be confirmed yet)**: Harbinger RPC down (TLS EOF from the box; 504 from an outside fetcher) and the faucet is Discord-only (needs a human login). Kit ready: `testnet/run_tests.mjs`, throwaway keys in `testnet/keys.testnet.json` |

**Per-transaction caps (final rule; numbers still estimates):** `ep_cap = measured max cost + authorize overhead + 10%`, hard maximum 3 Mana. Until the testnet run: **3.0 Mana** per action (≤ 1.9 observed on mainnet + ≤ 1.0 EST overhead). Overhead in compute: authorize decodes the operations, makes 3–4 storage reads and 2 writes, plus one KOIN `balance_of` call when `budget_base = 0`. Set `budget_base` to the balance to save that call.

**Kondor and a site-set payer (source read, Kondor @83c4561 2026-03-30; a browser check is still needed):**
- `background.ts` L296–300 only fills in `header.payer` when the site left it empty, so a site-set payer reaches the popup. The popup loads `header.payer` and `header.payee` and shows them as editable fields.
- "Use free mana" (default off) swaps payer → freemanasharer and payee → the old payer. With our payer set, that makes the station the payee, and the station refuses (station key required). The tx is rejected at no cost, so the site should say "leave Use free mana unticked".
- **Risk:** "Optimize mana" (default ON) first simulates the tx with Kondor's `manaMeter` as payer, then sets `rc_limit = 1.1 × rc_used` and keeps payer = station if the station has enough Mana (`utils.ts` `estimateAndAdjustMana` L177–340; popup `useManaMeter` L1449–1461). That simulation doesn't run the station's `authorize`. If our authorize costs more than about 10% of the action, the real tx could run short of `rc_limit`.
- Mitigation: keep authorize cheap (set `budget_base`, which skips the KOIN call) and measure on testnet with Kondor. Fallback: tell users to untick Optimize mana, which keeps the site's `rc_limit = ep_cap`.

**Payer helper (changed 2026-10-19 4:05 PM: default = the user's own Mana when they have enough; the station is used when they don't, or when they choose it).** Code: `helper/payer.js`.
```js
const cap = EP_CAP[action];                                     // e.g. 300000000n (3 Mana)
const own = BigInt(await provider.getAccountRc(user));          // chain.get_account_rc
const enough = own >= cap * 13n / 10n;                          // 30% cushion for pending-tx reservations
const opts = (pref !== "station" && enough)
  ? { payer: user, rcLimit: String(cap) }                       // default: own Mana
  : { payer: STATION, payee: user, rcLimit: String(cap) };      // no Mana, or the user chose free play
const tx = new Transaction({ signer, provider, options: opts });
```
- Settings: **"Use my Mana when I have enough (default)"** / **"Always use free play"**. Users without Mana never see a choice; they just play.
- If the station refuses (limits, floor or pause) and the user has some Mana, the helper asks "Free play limit reached. Use your own Mana?" Otherwise it says "Free play is busy, try again in a few minutes." A refused tx costs nothing.
- Effects:
  - Station spend drops to users who actually lack Mana, so its Mana stays nearer full and more KOIN stays withdrawable.
  - Kondor's "Optimize mana" risk (above) only applies in station mode.
  - Self-paying Kondor users keep Kondor's own behaviour, including its free-Mana option.
- Kondor's free Mana stays available to Kondor users either way.

**Hosting and cost: unchanged, $0** (GitHub Pages, public RPC, optional free Cloudflare Worker). Flagged costs: the Cloudflare paid plan ($5/month) only if the free limits are exceeded; a domain, which isn't planned; about 25 Mana for the station upload, from KOIN Carl already holds.

**Capacity at 30k (EST):**
- Sustainable: about 6,000 Mana/day ÷ about 2 Mana/action ≈ **3,000 actions/day**.
- Burst: about 9,600 extra actions above the floor.
- Users: about 120/day at the full 25-action cap; about 600/day at 5 actions.

## 7. v2 model (Carl, 2026-10-19 4:13 PM). Supersedes the §6 floor/split/budget rules
Code: `contracts/station/` (v1 kept in `contracts/v1-archive/`). Proposed mainnet settings: `contracts/station/config/mainnet.proposed.json`. Local only: nothing is deployed or signed.

**1. Budget and reserve.**
- Daily budget = `koin_amount × 20%` per **rolling 24 h** (1 h buckets): 6,000 Mana at 30k. That is exactly one day's refill, so normal spending always fully reloads.
- The other 80% (24,000) is the reserve. The station-wide 24 h cap is checked on every sponsored tx (plus any explicit owner boosts).
- `koin_amount` is a flexible owner setting. `set_config` refuses it above the station's live KOIN balance, and refuses `refill_bp` above 2000. If KOIN is ever withdrawn, lower `koin_amount` first.
- Normal spending also never takes Mana below `admin_min`, proposed at 100 Mana for the kill switch and admin. The old 6,000 floor is retired: the 24 h cap now does that job.

**2. Hard app allowances.**
- Each of Carl's apps gets `allowance_bp` of `koin_amount` per rolling 24 h (1000 bp = 3,000 at 30k). Adding KOIN grows the allowances.
- `set_app` refuses any split where the app allowances plus the sold slice exceed 20%.
- An app can go over only through an owner-signed, **expiring** `boost_mana` / `boost_until`, which also raises the station-wide cap for that time.

**3. Paid big uploads (from the reserve).** Prepaid `buy_big_upload(buyer, payee, mana, token, max_price, allow_upload)` creates a ticket for `payee` that expires after `big_ticket_ms`.
- **Using the ticket:** the payee's txs above `hard_max`, or that include an upload of the payee's own contract, are paid from the ticket. Each tx needs `rc_limit ≤ ticket.remaining`. Daily limits don't apply; `set_system_*` and uploads of other contracts are always refused.
- **Safety rules (proposed values at 30k):**

| Rule | Value | Why |
|---|---|---|
| Big floor (untouchable) | `admin_min + one day's budget` = 6,100 | Admin and kill switch always work, and the next day's allowances are never compromised |
| Per request | ≤ 2,000 Mana | One buyer can't take the reserve |
| Cooldown between purchases | 24 h | Spaces out reserve draws |
| Rolling 7-day cap | 6,000 Mana | At most one day's refill per week |
| Max outstanding debt | 6,000 Mana | Worst case: 30k − 6k (day) − 6k (debt) = 18k, well above the big floor |
| Ticket expiry | 72 h | Quotes don't sit open forever. `close_ticket` (anyone, after expiry) releases unused Mana from the debt |

- **Why a debt.** Mana regenerates at a fixed 20% of the balance per day. If the apps use their full allowances every day, Mana stays flat, and a big upload would never be refilled.
- So each big upload adds its Mana to a **debt** that is repaid at the sold slice's daily rate. **The sold slice pauses while the debt is above 0.** Total spend over time therefore never exceeds the refill, and the reserve always reloads.
- Consequence: big uploads need `sold_bp > 0`. With sold = 0, `quote_big_upload` says "no repayment capacity".

**4. Phase 1 selling (Carl is the only provider).**
- `buy_allowance(buyer, kind, target, mana_per_day, days, token, max_price)`:
  - kind 1 = calls into an app contract `target`, with per-user anti-spam.
  - kind 2 = txs whose payee is account `target`; any `call_contract` ops, KOIN transfers included, since they are paid.
- Sold allowances come only from the **sold slice** (`sold_bp`). Total active commitments must stay within the slice, and they are never counted against Carl's app allowances. Each allowance has its own rolling 24 h cap of `mana_per_day`.
- At most `max_allowances` (proposed 50) are open at once, and expired entries are cleaned on the next buy, which keeps the loops bounded.
- `renew(payer, id, days, …)` extends from the later of now and the current expiry, up to `max_days` (90) ahead. Access cuts off automatically at expiry.
- **⚠ CONFLICT, a decision for Carl:** Knode 3,000 + Stories 3,000 = all 6,000, so there is nothing left to sell and no big uploads. Options:

| Option | Knode / Stories / sold (per day) | KOIN | Effect |
|---|---|---|---|
| A. As stated | 3,000 / 3,000 / 0 | 30k | No sales and no big uploads until changed (tested: buys refused "sold capacity full") |
| B. Carve out | 2,550 / 2,550 / 900 (850/850/300 bp) | 30k | Sales and big uploads start now; each app −15% |
| **C. Add KOIN (recommended)** | 3,000 / 3,000 / 2,000 (750/750/500 bp) | 40k (+10k) | Carl's apps keep 3,000 each; sales could fund the extra KOIN |
| D. Start A, switch later | A now, then B or C once real usage shows idle allowance | 30k | Decide with data |

**5. Payment (stablecoins.md).**
- **Tokens:** vUSDT `12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh` (primary) and vUSDC `1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj` (optional). Both have 8 decimals and are Vortex-bridged. Each has an owner-set price (`per_mana_day`, `per_big_mana`, `min_days`), with numbers from Monetization.
- **Per-purchase cap:** `max_per_purchase` (proposed 500 vUSDT / 100 vUSDC, given thin KoinDX liquidity of about $5.9k / $179).
- **Rejected:** `set_price` refuses Chainge USDT `19WrWze3…fpH`.
- **Pattern: pull** (stablecoins.md §5.1). In one tx, op 1 is `token.approve(buyer, station, price)` and op 2 is `station.buy_*`, which calls KCS-4 `transfer(from=buyer, to=treasury, price)`. That spends the allowance, and any shortfall reverts the whole buy. Why pull rather than push + balance delta:
  - (a) Payment and access are atomic, with the exact amount and no balance-delta accounting to get wrong.
  - (b) It works when the treasury is Carl's wallet. A push would land in a wallet the station can't easily attribute.
  - (c) Stray or mistaken transfers can't be claimed by someone else.
  - (d) The allowance is set for exactly the price, so exposure is bounded.
  - The extra approve op is a small UX cost, and the helper adds it automatically.
- **Price guard:** the buyer passes the accepted quote as `max_price` (from `quote_allowance` / `quote_big_upload`); a higher price reverts.
- **Treasury (DECISION):** `config.treasury` empty = the station holds revenue, and the owner calls `withdraw_revenue(token, to, amount)` to Carl. Set to Carl's wallet = payments go straight to Carl, and on-chain withdraw is refused because the money is already there.
- **Refund / cancel (superseded by §7d: no refunds, `cancel_allowance` removed):** the contract has an owner-only `cancel_allowance(id, token, refund)`, which ends access now and optionally refunds from station-held revenue. Policy options:
  - (i) Non-refundable once access starts (simplest; matches stablecoins.md §7).
  - (ii) Pro-rata refund of unused full days on owner cancel.
  - (iii) Off-chain refunds only.
  - Big-upload tickets have no refund path in the contract; unused Mana just releases the debt.

**Tests (simulated chain, `npm test`): 15/15 pass.** A three-rule mutation check fails 2 tests, as expected.

| Check | Result |
|---|---|
| v1 rules (allowlist, transfers, unknown contract or entry point, uploads, over-cap, block/minute/cooldown, admin_min floor) | PASS |
| Hard app allowance stops at the limit; other app unaffected; frees after the rolling 24 h | PASS |
| Only the owner can boost; boost expires | PASS |
| Split > 20% refused; `koin_amount` above balance refused; `refill_bp` > 20% refused; allowances scale with `koin_amount`; reserve floor reports 80% | PASS |
| Carl's split A (sold 0) → no sales, no big uploads | PASS |
| Account allowance: paid to treasury, per-day cap, never counted against Carl's apps, auto cut-off at expiry, renew restores | PASS |
| App allowance with per-user limits | PASS |
| Sold slice hard cap; max_price, unpriced token, duplicate target, buyer signature, legacy token, per-purchase max | PASS |
| Big upload: per-request max, own-contract upload OK / foreign refused, ticket remaining, big floor, cooldown, debt cap, weekly cap | PASS |
| Debt pauses the sold slice; Carl's apps keep working; repays at the slice rate; `close_ticket` only after expiry and releases debt | PASS |
| Treasury = Carl's wallet (lands there; withdraw refused) and treasury = station (owner withdraw, cancel + refund) | PASS |
| Kill switch blocks sponsorship and buys; owner unpause below `admin_min`; station-key path | PASS |
| On-chain Mana costs, real KCS-4 pull against vUSDT | NOT RUN (testnet parked) |

**Size and cost:** the release wasm is 40,766 bytes. Uploading it costs roughly 29 Mana (EST, from the mainnet rc prices in §1). Authorize is now longer, with more storage reads in the sold and big routes. That makes the testnet measurement more important for the Kondor "Optimize mana" 10% margin.

**7a. Carl's 4:37 PM answers (applied; supersede parts of 2–4 above).**
- **Option A, reservations.**
  - Knode and Stories have absolute **reservations** (`app_object.reserved_mana`, 3,000 Mana/day each). They are no longer percentages.
  - Unused reservation is never sold.
  - **Sellable slice = daily budget (20% of `koin_amount`) − active reservations**, derived automatically. `sold_bp` is removed and nothing is set by hand.
  - At 30k: 6,000 − 6,000 = **0**, so no sales, no big uploads (no repayment capacity) and no exempt overflow.
  - Raising `koin_amount` within the actual balance (`set_config` checks this) creates a slice automatically, with reservations unchanged. Example: 40k → 2,000/day sellable.
  - `set_app` / `set_config` refuse reservations above the daily budget.
- **Fee-exempt allowlist** (`set_exempt` / `get_exempt`; owner key only; emits `station.exempt_changed` on every add, change or remove).
  - An exempt contract with `app > 0` is a reserved app (Knode → 1, Stories → 2), and its usage draws on that reservation. With `app = 0` it is another Carl project with no reservation.
  - `strict` = only allowlisted entry points with their caps; otherwise any entry point at `hard_max`.
  - **Exempt = fee-free, not limit-free:** per-user (block, minute, cooldown, rolling 24 h), per-tx cap, the 20% station-wide cap and `admin_min` all apply.
  - Usage beyond the reservation, and all `app = 0` usage, comes **only from the unsold part of the sellable slice**. That's sellable minus active sold commitments, in a rolling 24 h window, and it pauses while big-upload debt is repaid. If there is none, the tx is refused.
  - Reserved apps are now routed through the exempt list. The old "allowlisted entry → app" route is gone; entries now only carry per-action caps for strict contracts.
- **Storage indexes:** the app list and open sold allowances are kept in an explicit registry, so there are no open-ended storage scans. The station-wide and overflow windows have their own storage spaces.
  - Test note: the MockVM key store mixes up keys that differ only in bytes ≥ 0x80. The tests use low-byte ids; the real chain is unaffected.
- **Still open and configurable:** treasury, refund policy, big-upload limits, vUSDC. **Prices are blank** (Monetization).

**Tests (simulated chain): 19/19 pass.** A two-rule mutation check (overflow limit removed, `set_exempt` owner check removed) fails 5 tests.

| New / changed check | Result |
|---|---|
| Option A: Knode stops at its 3,000-equivalent reservation; no overflow when sellable = 0 | PASS |
| Option A: sellable 0 → quote and buy refused, big upload "no repayment capacity"; raising `koin_amount` within the balance → sellable appears, reservations unchanged, buy works | PASS |
| Reservations above the budget refused; `koin_amount` above the balance refused; sellable derived (400 − 160 = 240) | PASS |
| Exempt beyond reservation spills into the unsold sellable only; a sale reduces it; the released commitment returns it | PASS |
| `set_exempt` owner-only; event on add and remove; removed → refused | PASS |
| Exempt keeps per-block, per-tx cap and admin floor; non-reserved exempt limited to the sellable slice; refused when sellable = 0 | PASS |
| Exempt usage counts toward the 20% station-wide cap (stops at exactly 200 of 1,000 KOIN) | PASS |
| All earlier v1 and v2 checks (allowlist, transfers, uploads, cooldown, sold allowances, big uploads, debt, treasury, refunds, kill switch) | PASS |

Release wasm: 42,566 bytes (about 30 Mana to upload, EST). Proposed settings: `contracts/station/config/mainnet.proposed.json`.

**7b. Introductory prices (Carl approved via the Orchestrator, 17:11 UTC; source monetization_legal.md §8b). Applied locally.**
- **Schema** (`price_object`, per token, 8 decimals):
  - `price_1d` / `price_7d` / `price_30d` are per 1,000 Mana/day for the whole term: 3,000,000 / 20,000,000 / 75,000,000 ($0.03 / $0.20 / $0.75).
  - `big_per_1000` = 5,000,000 ($0.05 per 1,000 Mana).
  - `big_min_mana` = 5,000 Mana, so the minimum order is 25,000,000 ($0.25).
  - `max_per_purchase` stays as before.
  - The old `per_mana_day` / `per_big_mana` / `min_days` fields are retired.
  - Price = ceil(whole Mana × tier / 1,000).
- **Durations:** only 1, 7 and 30 days. Any other N is refused with "days must be 1, 7 or 30" (I took the preferred option: no per-day pricing for other N). A tier priced 0 is not offered.
- **Changes apply to new purchases only:**
  - Each allowance stores `token`, `term_days`, `unit_price`, `paid`, `term_start` and `total_paid`.
  - Each big-upload ticket stores `token` and `paid`.
  - `set_price` never touches existing terms. Everything is prepaid, so nothing is charged later.
- **Renewal = a new term at the price CURRENT at renewal time,** not the original price.
  - It starts when the running term ends; the running term keeps what it paid.
  - The allowance's snapshot is replaced by the new term's values and `total_paid` accumulates.
  - Every term is emitted as an event (`station.allowance_bought` / `station.allowance_renewed`).
  - The `max_price` guard protects the payer from a price change between quote and renew.
- **No auto-renew anywhere:** there is no scheduled or third-party charge path. `renew` needs the payer's own signature (the owner can't either), and expiry simply ends service.
- **Conflict (Carl decision):** the old big-upload limits (2,000 per request, 6,000 weekly, 6,000 outstanding) were inconsistent with the 5,000 minimum.
  - Proposed: per-request max 6,000, weekly 12,000, outstanding 6,000.
  - Debt is repaid at the sellable rate, so 6,000 takes 6,000 / sellable days (3 days at 40k KOIN).
  - Suggested rule: outstanding ≈ 3 × sellable/day, weekly ≈ 2 × per-request max; re-set these when `koin_amount` changes.
  - **At 30k, big uploads stay unavailable** because the sellable slice is 0.

**Tests: 23/23 pass** (4 new). A mutation check (big minimum removed, any N priced, renewal snapshot not updated) fails 3 tests.

| New check | Result |
|---|---|
| Price snapshot on purchase; a price change leaves the existing term (price, expiry, balance, service) alone; new buys and renewals pay the new price; renewing at the old price is refused | PASS |
| Only 1/7/30 days (2, 3 and 14 refused); 1,000 Mana/day → 3,000,000 / 75,000,000; a tier priced 0 is not offered | PASS |
| Big-upload minimum enforced (below it refused); ticket stores what was paid; 5,000 Mana quotes 25,000,000 | PASS |
| No auto-renew: after expiry nothing is charged and expiry is unchanged; a third party or the owner can't renew | PASS |

Release wasm: 44,024 bytes.

**7c. Treasury and buffer (Carl, 5:18 PM; buffer source decided by Carl at 5:22 PM). Applied locally.**
- **Treasury: decided, direct to Carl.** With `treasury` empty (the default), every payment is pulled `transfer(from = buyer, to = owner wallet)` in the same tx.
  - The owner can change it to another address, or to the station's own id (then `withdraw_revenue` works).
  - `get_status.treasury` shows where payments land now.
- **Buffer: decided by Carl.** A fee-exempt reserved app may go `buffer_bp` (owner-configurable, default proposal 2000 = 20%, max 50%) above its daily allowance: 3,000 → up to 3,600, then refused.
  - **Where it comes from:** straight from the reserve. Buffer Mana is outside the 20% daily cap, so it never takes room from paying customers.
  - **No repayment:** no debt and no cut to the next day's slice. Carl: free projects won't do this every day, the reserve is a good buffer, and he'll add KOIN if it's consistently short.
  - **Hard floor:** the 6,100 Mana floor (`admin_min` 100 + one day's budget 6,000) is never touched; a buffer tx that would cross it is refused.
  - Worst case at 30k: 3,600 + 3,600 = 7,200 vs a 6,000 refill, so the reserve dips by at most 1,200 on such a day and refills when usage drops.
  - **Paid allowances:** hard-capped at what was bought, with no buffer; buyers can buy more.
  - Exempt projects without a reservation (app 0) keep the unsold-slice rule.
  - The new-user pool is `new_pct` of the buffered limit.
- **Alerts:**
  - `station.buffer_used` on every buffer tx (app, payee, rc, app use incl. this tx, allowance, limit, Mana after).
  - `station.reserve_low` once per dip when Mana falls below `alert_mana` (owner-configurable; 0 = default 15,000), re-armed once Mana is back above it. That's Carl's "add KOIN" signal; an off-chain watcher must forward it, because the contract can't message anyone.
  - UNVERIFIED: that events emitted inside `authorize` (when the station is payer) land in the tx receipt on a real node. Testnet check, still parked.

**Tests: 25/25 pass** (new: buffer, hard floor + configurable %, reserve alert; treasury tests reworked). A 4-rule mutation check (no hard floor, old station-default treasury, alert repeating, wider buffer) fails 4 tests.

| New / changed check | Result |
|---|---|
| Buffer 80 → 96 from the reserve; `buffer_used` event per buffer tx; buffer outside `used_24h`; a fully sold paid allowance still gets exactly its 40/day (no buffer); no debt the next day | PASS |
| Buffer refused 1 unit below the hard floor (admin_min + budget), allowed at it; `buffer_bp` 0 → hard stop at the allowance; > 50% refused; owner-only | PASS |
| `reserve_low` once per dip, not repeated, re-armed after recovery; `alert_level` reported | PASS |
| Default treasury = owner wallet (payment lands there, the station holds 0, withdraw refused); owner-only switch to the station, then withdraw and refund | PASS |
| Option A / boost / two-app tests updated for the 20% buffer | PASS |

Release wasm: 45,371 bytes. Test note: MockVM's event list breaks past about 9 events, so the buffer test counts and clears events per tx (a mock limitation, not the contract).

**7d. Carl's final decisions (7:32–7:33 PM). Applied locally.**
- **Unreserved fee-exempt projects: decided by Carl, keep current behavior.** A fee-exempt project without a reservation (app 0) is served only from the unsold sellable slice, so it is refused while that slice is 0 (at 30k). Capacity opens when Carl adds KOIN or assigns it a reservation.
- **No refunds: decided by Carl.** Buyers pay for future usage, and daily and weekly offers exist, so they shouldn't buy more than they need.
  - `cancel_allowance` (owner cancel with an optional refund) is **removed**. The contract has no path that pays tokens to a buyer. `payOut` is only reachable from `withdraw_revenue`, and only when the treasury is the station.
  - Big-upload tickets never had a refund; unused Mana expires with the ticket.
  - The kill switch (`set_paused`) stays: pausing stops service and moves no money.
  - **Terms shown to the UI:**
    - `quote_allowance` and `quote_big_upload` return `refundable = false`, `auto_renew = false` and `terms`.
    - Every purchase or renewal emits a `purchase_event` with the same three fields, plus the allowance or ticket and the amount paid.
    - Texts (`ALLOWANCE_TERMS` / `BIG_TERMS`): "Prepaid for future use. No refunds. No auto-renew: service stops at expiry unless you renew, at the price current then. Daily, 7-day and 30-day offers: buy only what you need. Non-transferable; not redeemable for crypto or cash. Introductory prices may increase for new purchases. Service may be paused (kill switch)." The big-upload version adds "Unused Mana expires with the ticket."
  - **⚠ Flags against monetization_legal.md (Carl to confirm, or adjust the ToS with a lawyer; not silently changed):**
    1. §8 (5) says "Refunds only if Carl fails to deliver (pro rata, same token, to the paying address); otherwise non-refundable. Stated before purchase." §3 says paid plans get "credits only (e.g. pro-rata credit if availability <99%)". Carl's rule removes even the failure-to-deliver refund, for example during a kill-switch pause, a reserve shortfall or a bridge problem. Lower-risk option that keeps the contract change: honour failure-to-deliver cases off-chain from Carl's own wallet (the treasury is his wallet), or as a free renewal credit. Either way, the ToS must say exactly what applies.
    2. §3/§4 require a **right to cut off** abusive buyers, and §8 says to **refuse sanctioned or flagged addresses**. Before, `cancel_allowance` could cut off one allowance. Now the only lever is the station-wide pause, which also stops every honest buyer and Carl's apps. Suggested (not built): an owner-only `suspend_allowance(id)` that ends one allowance with no money movement, limited to abuse or sanctions cases and stated in the ToS. Needs Carl's yes.
    3. "No refunds" plus "may be paused" makes honest disclosure essential. Both are in the terms text; the UI must show them before purchase. Consumer-law review of no-refund prepaid digital services is still a lawyer item ⚖.
- **Big-upload limits: decided by Carl, approved as proposed.**
  - 6,000 Mana per request (≥ the 5,000 minimum), 12,000 per rolling 7 days, 6,000 outstanding. All owner-adjustable via `set_config`.
  - Still unavailable at 30k: the sellable slice is 0, so there is no repayment capacity.
- **Stablecoins: decided by Carl, both accepted.**
  - vUSDT (max 500 per purchase) and vUSDC (max 100 per purchase), both active. Payments go directly to Carl's wallet in the token paid.
  - vUSDC's lower max is deliberate: its liquidity on Koinos is thinner (stablecoins.md), so less is at risk if it can't be swapped or bridged out.

**Tests: 28/28 pass.** New: no-refund terms on quotes and events; vUSDT + vUSDC with separate maxima; the approved big-upload limits at mainnet scale and owner adjustment. The refund test was changed to: a pause moves no money and the term continues.

| New / changed check | Result |
|---|---|
| Quotes and purchase events carry `refundable=false`, `auto_renew=false` and the terms text (allowance and big upload) | PASS |
| Treasury = station: the owner can withdraw revenue; a pause refunds nothing; the term continues after unpause | PASS |
| vUSDC 105-token order refused (max 100), the same order passes the vUSDT max (500); a vUSDC buy lands in Carl's wallet | PASS |
| At 40k KOIN: 6,001 above the per-request max; 6,000 accepted ($0.30); outstanding 6,000 blocks the next; weekly 12,000 reached; owner raises the limits | PASS |

Release wasm: 46,705 bytes; ABI 22 methods (`cancel_allowance` gone).

## VERIFY answers (Designer list and design.md)
1. **Ordinary wallet as a station?** Yes, by uploading the contract to that address. It then becomes a contract account for the overridden types only. The private key keeps every type that isn't overridden. Use a separate account (§2). Each provider needs their own station contract account (§5). VERIFIED (authority docs; Fogata and Knode patterns).
2. **Paying for calls into other contracts?** YES. The payer filters operations in `authorize` (§1, §2). VERIFIED in source. Testnet confirmation still recommended.
3. **Vault and a relayer?** No sign-only path or payer field in the documented API, so a relayer can't wrap Vault signatures. Use the play account now (A), session keys optionally (B), and file a Vault feature request (C). VERIFIED from docs; undocumented endpoints UNVERIFIED.
4. **Knode and SwarmTales: shared code?** No. Separate repos, contracts and sites. One shared JS helper should serve both (§3). VERIFIED.
5. **Rejected transactions:**
   - **If the station's authorize rejects, the station loses no Mana.** `submit_transaction` runs the transaction on a throwaway state node. An authorize failure throws `authorization_failure_exception`; every reversion at that stage is converted to a *failure*. The transaction isn't broadcast or added to the mempool, so no Mana is consumed and the counter writes are discarded. The node's CPU absorbs the cost. VERIFIED (controller.cpp, system_calls.cpp).
   - **Mana *is* charged when authorize passes and the call later reverts.** The transaction is included and the payer pays. That's why the per-user and global caps live in authorize, and their writes persist through a revert. VERIFIED.
   - **Mempool:** it reserves `rc_limit` against the payer for pending transactions (`check_pending_account_resources`). A flood of valid-looking transactions can temporarily exhaust the station's *available* Mana, a denial of service without loss.
   - **Server pre-filtering** (per-IP and per-device limits, nonce queueing) is recommended for uptime, not required for Mana safety.
6. **Mana cost of one authorize check: EST 0.2–1.0 Mana.**
   - Formula: rc = 48 × compute ticks + 9,345 × network bytes + 61,770 × disk bytes (live `chain.get_resource_limits`). It reproduced one observed receipt exactly.
   - Observed: the cheapest single-call mainnet transactions use ~0.5–0.6M ticks (~0.25 Mana) in total. An authorize with about 5 storage reads, 2–3 writes and op decoding is EST 0.4–2M ticks (0.2–1.0 Mana).
   - Add about 0.03–0.04 Mana of disk for each new per-user-day counter, and about 0.01 Mana of network for the payee field and the second header.
   - **Pending measurement.** I found no read-only RPC that can run `authorize`; `broadcast:false` still needs a signed transaction. A testnet or local-node measurement needs Carl's OK.
7. **Provider fees without custody?** Apps pay directly to the provider's own station address, and access is gated on chain by `paid_until`. The operator's cut is a separate direct transfer. The registry holds nothing (§5). DESIGN.

**Corrections to design.md:**
- "authorize compute is billed to the payer" is right only for **included** transactions. Rejected ones cost nothing (VERIFY 5).
- "writes persist even if the transaction reverts" is true for reverted (included) transactions, false for rejected ones.
- The ~1.1 Mana per action planning figure holds for simple calls. Budget 1.5 Mana including authorize (EST).
- Kondor's handling of a pre-set payer is UNVERIFIED.

## 5-line summary
1. The station is a fallback (own Mana first). It pays only for allowlisted calls into Carl's apps, sold allowances or prepaid big-upload tickets, never for other people's admin calls, foreign uploads or system ops. Free (Carl-app) sponsorship still refuses token transfers.
2. v2 budget: 20% of `koin_amount` per rolling 24 h (6,000 at 30k), always refilled; 80% reserve; `admin_min` 100 is untouchable.
3. Absolute reservations (Knode and Stories 3,000 each) for exempt Carl projects; only an owner boost exceeds them. The sellable slice = budget − reservations (0 at 30k). Per-user anti-spam is unchanged.
4. The derived sellable slice backs prepaid vUSDT/vUSDC allowances (pull payment, auto expiry, renew), exempt overflow and big-upload debt repayment. It is 0 at 30k, so all three stay off until KOIN is added.
5. 28/28 simulated-chain tests pass (no refunds, vUSDT + vUSDC, approved big-upload limits). Earlier: 25/25 (payments go directly to Carl; exempt apps get a 20% buffer from the reserve with alerts; paid allowances hard-capped). Earlier: 23/23, with the introductory prices applied (1/7/30-day tiers, price snapshot, no auto-renew) (owner-only fee-exempt allowlist with events; fee-free, not limit-free). Testnet is parked. Knode `set_sponsor_limit(0)` waits until the station is fully launched.

**Decided (2026-10-19):** rolling windows; testnet OK (parked); Knode off only after launch; own Mana is the default payer; v2 budget model; vUSDT primary / vUSDC optional; Chainge USDT rejected.

**Decided (4:37 PM):** option A (reservations 3,000 + 3,000; sellable derived, 0 at 30k); fee-exempt allowlist for Carl's projects; prices blank until Monetization.

**Decided (17:11 UTC):** introductory prices from §8b; tiers 1/7/30 days only; price changes for new purchases only; renewals at the current price; no auto-renew.

**Decided (5:18 / 5:22 PM, Carl):** treasury = owner wallet (direct pull, owner-changeable); fee-exempt apps get a 20% buffer from the reserve, no debt or repayment, 6,100 floor untouchable, `buffer_used` / `reserve_low` (15k) events; paid allowances hard-capped.

**Decided (7:32–7:33 PM, Carl):** no refunds (`cancel_allowance` removed; kill switch stays); big-upload limits 6,000 / 12,000 per 7 days / 6,000 outstanding, owner-adjustable; vUSDT (max 500) and vUSDC (max 100, lower for liquidity) both accepted; unreserved fee-exempt projects refused while the sellable slice is 0.

**Still for Carl (flags, not open design decisions):**
1. Legal fit of "no refunds" against monetization_legal.md: failure-to-deliver refunds or credits, and the per-buyer cut-off for abuse or sanctions (proposed `suspend_allowance`, not built). See §7d.
2. When to add KOIN: at 30k there is nothing to sell and no big uploads (e.g. +10k → 2,000/day).
3. Testnet is still parked (the box can't reach Harbinger). Verify `authorize` events, cost and the Kondor "Optimize mana" margin there before mainnet.

Sources for this section: Koinos payer/authorize, Mana and disk-delta facts as cited in §1 and §7. The 4:37 PM rules come from Carl's answers. Station.ts and Station.spec.ts are local code, not deployed.
