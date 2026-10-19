# Knode: turn sponsorship off (`sponsorOk` → always false). Carl signs; nothing has been sent
> **WHEN (Carl, 2026-10-19): do this only after the Mana Station is fully launched and the apps (Knode, SwarmTales) use it. Not before.**

_Prepared 2026-10-19 from github.com/bawcejawn/Knode @ a208215. Live values below come from a read-only `get_state` via rest.koinos.io._

## What the change is
| Item | Value | Source |
|---|---|---|
| Contract | `1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr` (mainnet) | `game-data/deployment.json` |
| Method | `set_sponsor_limit`, entry point **1906813279** (0x71A7A95F) | `game/abi/kpred.koilib.json` |
| Arguments | `{ "max_sponsor_rc": "0" }` (uint64, in Mana satoshis; 1 KOIN = 100000000) | proto `set_sponsor_limit_arguments`, field 1 |
| Who must sign | owner **`1635QUrBNDp7WqmFkRvrkGwjJXTtFvH717`** (`isOwner` → `System.checkAccountAuthority(owner)`) | `game/assembly/Kpred.ts` L162–164 |
| Effect | `sponsorOk` returns false whenever `rc_limit > max_sponsor_rc`. With 0, every transaction that asks the contract to pay is refused before it reaches a block, so it costs nothing | `Kpred.ts` (`sponsorOk`) |
| Current value (live) | `max_sponsor_rc: "200000000"` = 2 KOIN; contract Mana ≈ 50.8 | `GET https://rest.koinos.io/v1/contract/1Mpmf2…/get_state` |
| Cost | About 1–5 Mana from the owner wallet's own Mana; no KOIN is spent | the bot sets `rcLimitKoin: 5` |

Nothing else changes: deposits, withdrawals, claims and the game keep working. Withdrawals can never be paused (`LAUNCH.md`, "Emergency levers").

## Option A: the repo's bot (the documented way, `LAUNCH.md` L261/L283)
1. In the Knode folder, make sure `.env` contains the owner key (`OWNER_WIF`, or its fallback) and `CONFIRM_MAINNET=yes`. The bot refuses mainnet sends without it (`bot/bot.ts` L838).
2. Dry run, which sends nothing: `npm run bot -- sponsor-limit 0`. It should print `As owner (1635QUrB…)` and `set_sponsor_limit {"max_sponsor_rc":"0"}`.
3. Send: `npm run bot -- sponsor-limit 0 --send`. Expect `✔ done (Mana used …) transaction 0x…`.
4. Optional: afterwards, remove `CONFIRM_MAINNET=yes` again.
_Note: this keeps the owner private key in a file on the PC. Option B keeps it inside Kondor._

## Option B: Kondor (key stays in the wallet)
Kondor itself has no generic "call a contract" screen, so you use a block explorer that connects to Kondor:
1. Open the contract on **koinosblocks.com** (or koinscan.io): search `1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr` and open its contract or "write" tab.
2. Connect Kondor and select the **owner account `1635QUrB…`**. Any other account makes the call fail with "owner only" and nothing changes.
3. Choose `set_sponsor_limit`, enter `max_sponsor_rc = 0`, and submit.
4. In Kondor's approval window, check: contract `1Mpmf2…`, entry point 1906813279 / `set_sponsor_limit`, value 0. Approve.
_UNVERIFIED: I didn't open these explorer UIs. Field names and tabs may differ. The explorer reads the ABI from the chain (the REST call above proved it is available). If the explorer has no write tab, use Option A or C._

## Option C: koinos-cli
```
connect https://api.koinos.io
open <owner-wallet-file> <password>          # or: import <OWNER_WIF> <file> <password>
register kpred 1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr   # pulls the ABI from the chain
kpred.set_sponsor_limit 0
```
_UNVERIFIED: exact command syntax (github.com/koinos/koinos-cli README). Run `help` in the CLI first._

## Verify afterwards (read-only, free, no wallet)
```
curl -s -A check https://rest.koinos.io/v1/contract/1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr/get_state
```
- Expect `"config":{… "max_sponsor_rc":"0" …}`. Before the change it shows `"200000000"`.
- The same read is also `npm run bot -- status`, or the explorer's `get_state` read tab.
- Also look up the transaction id on koinosblocks.com and confirm it shows success.

## Rollback (only if wanted)
- Same call with `max_sponsor_rc = 200000000` (2 KOIN): `npm run bot -- sponsor-limit 2 --send` (`LAUNCH.md` L261).
- The contract caps the value at 10 KOIN (`MAX_SPONSOR_LIMIT`).
- Verify with the same `get_state` read.

## Do Kondor's free Mana and the site keep working?
- **Kondor free Mana: yes.**
  - Kondor's sharer (`162GhJwsciDiKsgwzj2t6VoFHt3RMzGKdG`, freemanasharer) approves on its own terms: `transaction_application` only, a payee must be set, and `rc_limit ≤ 100 Mana`.
  - It doesn't look at which contract is called, and it doesn't depend on Knode's `sponsorOk` (freemanasharer source, `authorize`).
  - Knode users who tick Kondor's free-Mana option are paid for by that sharer as before.
  - Its daily availability is Kondor's call. It is limited by the sharer's own Mana pool, which isn't ours.
- **Site: no change required.**
  - `site/wallet.js` `sendKondor` never sets a payer, and `sendVault` uses `mana:"auto"`. The site never asks the Knode contract to pay.
  - `app.js` already says "In Kondor, tick the free Mana option".
  - Optional copy tweak: wherever a page says the project covers Mana, change it to "Players pay their own Mana, or use Kondor's free Mana." `LAUNCH.md` already says this: "The project is not paying anyone's Mana right now."
  - Don't offer a site sponsor until the Mana Station is live (BUILD_PLAN).
- **Users with no Mana and no Kondor free Mana** (e.g. KOIN Vault): their transactions fail before reaching a block and cost nothing. They need a little KOIN of their own, or Kondor.
