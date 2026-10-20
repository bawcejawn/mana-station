# Mana Station: who can do what, and how to launch

Status on 2026-10-20 (branch `fix/squat-freeze-stall`, PR #1):

- **Unit tests:** 71 of 71 pass (`contracts/station/assembly/__tests__/Station.spec.ts`).
- **Testnet:** 100 of 100 checks pass (`testnet/run_tests.mjs`).
- **Playground:** a station is live on the Koinos testnet and handed over to Carl's wallets.
- **Not done yet:** mainnet deployment, a legal review of the terms, and a domain.

## 1. Access: who can do what

"Signs" means the chain's `check_authority` for that address passes. For a wallet that means its key signed. For a contract it means its own `authorize` said yes.

### Reading

| Action | Who | Tested in |
|---|---|---|
| Status, prices, quotes, allowances, tickets, escrow, connected apps, proposals | Anyone, with no wallet | `console.html`, `buy.html`, testnet run |

### Buying (app builders)

| Action | Who must sign | Tested in |
|---|---|---|
| `buy_allowance`: daily free play for an app | The buyer **and the app itself** (so nobody can claim someone else's app) | unit "#3 target squat"; testnet "buy_allowance without the target app's signature refused" |
| `renew` | The wallet paying for the renewal signs. Anyone may extend an allowance with their own money; it can never be renewed without a signed payment. | unit "no auto-renew… only the payer can renew" |
| `buy_big_upload`: a 24-hour ticket | The buyer. The ticket only ever pays for the payee's *own* contract, and the payee still signs those transactions. | unit "big-upload ticket only sponsors calls to the payee's own contract"; testnet ticket section |
| `cancel_allowance` / `cancel_big_upload` | The buyer. A suspended buyer can't self-cancel; the owner can refund them instead. | unit escrow and refund tests; testnet "suspended buyer cannot self-cancel" |
| `close_ticket` after expiry, `release` after a term ends | Anyone. The money only ever goes to the treasury or back to the buyer. | unit "release before the end refused even for the owner" |
| Limit per wallet | At most 5 open allowances and tickets together | unit "one wallet's open allowances and tickets together are capped" |

### Owner (day-to-day operator)

| Action | Who | Tested in |
|---|---|---|
| Connect, change or disconnect a free app (`connect_app` / `disconnect_app`); per-function caps (`set_entry`) | Owner | unit "connected apps"; testnet connect, list and disconnect |
| Prices (`set_price`), suspend or unsuspend a buyer, `owner_refund` (never for the operators' own purchases) | Owner | unit suspension and L4 tests |
| `set_config`: limits only | Owner. **Refused** for the owner, treasury, council, threshold or delay, and for any higher ticket fee. Those all go through the council. | unit "operators: … money settings need the council" |
| Resume after a pause | Owner | same |

### Council (2 of 3 on the playground)

| Action | Who | Tested in |
|---|---|---|
| Pause the station (emergency brake) | The owner or **any one** council member | unit "operators"; testnet operators section |
| `propose` a guarded action, `approve` it | Council members | unit "audit #1" block; testnet council section |
| Veto (`cancel_proposal`) during the wait | **Any one** member. Exception: a member can't veto their own removal. | unit "veto" and "H1" |
| `execute` once approved and the wait has passed | Anyone | unit "KOIN withdrawal: 2 of 3, then 48 h" |

**Guarded actions:** upgrading the code, withdrawing KOIN, rescuing a token sent by mistake, changing the council, the waiting period, the treasury or the owner, and raising the ticket fee.

- **Wait:** at least 48 hours on mainnet (2 minutes on the playground), at most 30 days.
- **Cap:** each member can have at most 3 proposals open at a time.
- **Council change:** restarts the wait on every open proposal.

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

1. **Calls to the station itself, from the owner or a council member.** Allowed for admin and votes, even while paused, within the same per-minute and per-day limits as players.
2. **Paused:** nothing else is paid for.
3. **A big-upload ticket holder:** uploading or calling *their own* contract, up to the ticket's Mana, for 24 hours.
4. **Calls into one connected free app:**
   - only that app in the transaction;
   - per-function caps, or listed functions only in strict mode;
   - per-player limits: a few actions a minute (10 on the playground), then a pause, one per block, and a daily cap that is smaller for new players;
   - the app's daily amount; an app with a reserved share may go up to 20% over it (owner-configurable), taken from the reserve.
5. **Calls into an app with paid free play**, under the same per-player limits.
6. **Never paid:**
   - token transfers;
   - transactions mixing several contracts;
   - unknown apps;
   - anything that would take the station below its safety floor.

A refused transaction costs the player nothing. The player's app can then offer to use their own Mana instead (`helper/payer.js` → `sendAction`).

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
// on "has not authorized" / insufficient rc → offer the player's own Mana (helper/payer.js sendAction does this)
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
- [ ] **Deploy and init in one transaction:** upload with all three permissions plus `init`, exactly as `testnet/playground.mjs deploy` does. Fund the station's KOIN first.
- [ ] **Prices** (`set_price`) for vUSDT and vUSDC: introductory $0.03 / $0.20 / $0.75 per 1,000 Mana a day; big upload $0.05 per 1,000, minimum 5,000 Mana.
- [ ] **Connect Knode and Stories** in strict mode with per-function caps. Then step 3 of section 3.
- [ ] **Watch** for `reserve_low` events, and for escrow totals equal to the station's token balance (`get_escrow_totals`).
- [ ] **Release payments:** after terms end, anyone (for example a small cron) calls `release`.
- [ ] **Site:** choose the domain; add the canonical and og:url tags and the sitemap host. Point the console at mainnet.
- [ ] **Test the emergency brake once on mainnet:** a council member pauses, the owner resumes.

## 5. Try it on the playground

| Page | What to do |
|---|---|
| `buy.html` | Create an app wallet, buy a ticket and upload "your app" with it, buy daily free play (the app co-signs), see the refund each purchase would give now, then renew, cancel or end early. |
| `play.html` | Choose the demo app or your paid app and tap as a player with no KOIN. The tap stands in for a real action such as a Knode prediction or a SwarmTales vote. |
| `console.html` | Sign as Owner or a council member: connect or disconnect apps, pause, propose, approve, veto, execute. |
