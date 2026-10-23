# Mana Station — Koinos stablecoins (vUSDT / vUSDC)

**Date:** 2026-10-19 (UTC)  
**Scope:** read-only research for prepaid payment in vUSDT / vUSDC. No spend, no signing, no on-chain writes.  
**Status:** addresses and on-chain metadata verified via RPC; liquidity and payment pattern assessed. Not legal advice.

---

## 1. Official contract addresses (Koinos mainnet)

| Token | Name (on-chain) | Symbol | Decimals | Contract address |
|---|---|---|---|---|
| **vUSDT** | Vortex Tether USD | vUSDT | 8 | `12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh` |
| **vUSDC** | Vortex USD Coin | vUSDC | 8 | `1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj` |

Related (not recommended as payment currency for Mana Station):

| Token | Name | Symbol | Decimals | Address | Notes |
|---|---|---|---|---|---|
| Legacy Chainge USDT | Tether USD | **USDT** (no `v`) | 8 | `19WrWze3XAoMa3Mwqys4rJMP6emZX2wfpH` | Older Fusion/Chainge wrapped USDT; still on-chain; do **not** confuse with vUSDT |
| vETH | Vortex ETH | vETH | 8 | `1Tf1QKv3gVYLjq34yURSHw5ErTYbFjqTG` | Same Vortex family; not a stable |

### Cross-checks (multiple sources)

| Source | vUSDT | vUSDC | Notes |
|---|---|---|---|
| [KoinDX official token list](https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json) | `12VoHz…Yk6pXh`, name “Vortex USDT”, `allowance: true`, website vortexbridge.io | `1N8iYr…KmFnj`, “Vortex USDC”, same | Primary public list used by the DEX |
| [tokens.koindx.com/mainnet.json](https://tokens.koindx.com/mainnet.json) | Same addresses | Same | Live API used by Vortex UI (`VITE_TOKEN_API`) |
| [Kondor wallet site](https://kondorwallet.com/) | Named as wrapped via Vortex | Named as wrapped via Vortex | Does not print addresses on the marketing page; confirms Vortex as the bridge |
| On-chain `contract_meta_store.get_contract_meta` via `https://api.koinos.io` | ABI present; methods include `get_info`, `total_supply`, `approve`, `allowance`, `transfer` | Same | Confirms both IDs are live contracts |
| RPC `chain.read_contract` `get_info` + `total_supply` via `api.koinos.io` and `rest.koinos.io` | name/symbol/decimals/supply match table | Match | See §2 |
| koinosblocks.com / koinscan.io | Address pages exist; explorer UI often fails to load live RPC | Same | Explorers are secondary; RPC is authoritative |
| Vortex `interface-bridge` repo `src/constants/tokens.js` | Mainnet list in that file is incomplete (KOIN/ETH only) | — | Older UI config; live token list is KoinDX’s, not this file |

**Do not use** the legacy address `19WrWze3XAoMa3Mwqys4rJMP6emZX2wfpH` for new prepaid flows. Symbol is `USDT`, not `vUSDT`; pool looks stale (see §3).

---

## 2. On-chain metadata (read-only RPC)

Queried 2026-10-19 against `https://api.koinos.io` and cross-checked on `https://rest.koinos.io` with `User-Agent: GrokBot-ManaStation-Research/1.0`.

Entry points used (from each contract’s on-chain ABI meta):

- `get_info` = `0xbd7f6850` (returns name, symbol, decimals together)
- `total_supply` = `0xb0da3934`

Note: standalone `name` / `symbol` / `decimals` entry points (`0x82a3537f`, `0xb76a7ca1`, `0xee80fd2f`) currently exit with code 1 on these Vortex contracts; `get_info` works. Treat `get_info` as the reliable metadata call.

| | vUSDT | vUSDC |
|---|---|---|
| name | Vortex Tether USD | Vortex USD Coin |
| symbol | vUSDT | vUSDC |
| decimals | 8 | 8 |
| total_supply (raw) | 634201488592 | 23828328230 |
| total_supply (human) | **6,342.01488592** | **238.28328230** |

Chain id observed: `EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA==` (mainnet).

---

## 3. Liquidity assessment

### 3.1 KoinDX pairs (periphery `get_pair` → pair `get_reserves`)

KoinDX mainnet periphery: `17e1q6Fh5RgnuA8K7v4KvXXH4k9qHgsT5s`  
([@koindx/v2-sdk `src/addresses.ts`](https://github.com/koindx/v2-sdk/blob/master/src/addresses.ts))

| Pair | Pair address | reserveA (KOIN, human) | reserveB (stable, human) | Stable depth ≈ | Last reserve update (UTC) |
|---|---|---|---|---|---|
| vUSDT / KOIN | `1E8AjPZxKLJGFouXtNNkPcYxAgsTh4AUTN` | ~291,094 KOIN | ~5,923 vUSDT | **~$5.9k** | 2026-10-19 08:16 |
| vUSDC / KOIN | `19ygpmxRiM9zU7yiVc9wnbtHEK4Aa6s2gL` | ~8,836 KOIN | ~179 vUSDC | **~$179** | 2026-10-19 07:58 |
| Legacy USDT / KOIN | `16PVFQ6bwRnAZD7i3xmu6jX6MoG3vwYYgW` | ~9,601 KOIN | ~2,267 USDT | ~$2.3k (stale price) | **2025-10-27** |

Ordering note: for Vortex pairs, reserveB matches almost all of circulating supply of the stable (vUSDT: 5,923 of 6,342 ≈ 93% of supply sits in the pool; vUSDC: 179 of 238 ≈ 75%). So reserveB = stable, reserveA = KOIN. Implied ~49 KOIN per $1 on both Vortex pools (consistent with each other). The legacy USDT pool’s implied price (~4.2 KOIN/$) disagrees and its `blockTime` is ~1 year stale — treat as abandoned for pricing.

### 3.2 Activity

`account_history.get_account_history` on the token contracts (newest first, limit 10):

- **vUSDT:** highest `seq_num` observed **1711**. Recent events mix `token.approve_event`, `token.transfer_event`, and at least one `token.mint_event` + `bridge.transfer_completed_event` (bridge redeem).
- **vUSDC:** highest `seq_num` observed **1684**. Same approve/transfer pattern (DEX-style).

Interpretation: both tokens see ongoing DEX activity on the order of low thousands of lifetime history entries — **thin but live**. Not dead contracts.

### 3.3 Bridge / redemption risk

- Branding and KoinDX metadata: **Vortex** (`vortexbridge.io`), not Chainge, for vUSDT/vUSDC.
- Kondor: “vETH, vUSDC and vUSDT are wrapped assets, bridged from their native chains through the Vortex bridge.”
- Official Koinos docs ([koinos.io/get-koin](https://koinos.io/get-koin)): Vortex is the current Ethereum↔Koinos bridge; Chainge’s older `wKOIN` path is deprecated; Vortex’s own disclaimer states it is **unaudited** and users can lose tokens; redeem on the destination chain is the user’s responsibility.
- History evidence of `bridge.transfer_completed_event` on vUSDT supports a live mint/redeem path.
- **Redemption risk:** vUSDT/vUSDC are IOUs of a small, unaudited bridge validator set. Peg and redeemability depend on Vortex operators and underlying USDT/USDC custody on the foreign chain. Total floating supply on Koinos is tiny (~$6.3k vUSDT, ~$238 vUSDC), so any large redeem or bridge halt would hit holders hard. Accepting them as payment means Carl holds that peg/bridge risk until he swaps or bridges out.

### 3.4 Liquidity verdict for Mana Station prepaid

| Asset | Payability | Caveat |
|---|---|---|
| **vUSDT** | Usable as primary prepaid currency | ~$6k total float; ~$5.9k in KoinDX. Fine for small prepaid fees; not for large one-shot “big upload” invoices without OTC/another venue |
| **vUSDC** | Secondary / optional | Only ~$238 total; ~$179 in pool. Large slippage if Carl tries to exit size |
| Legacy USDT | **Reject in allowlist** | Wrong symbol; stale pool; Chainge-era |

---

## 4. KCS-4 / allowances — can the station pull payment?

### Standard

[KCS-4](https://github.com/koinos/koinos-contract-standards/blob/master/KCSs/kcs-4.md) (and [docs.koinos.io token guide](https://docs.koinos.io/developers/guides/token/)):

- Methods: `approve(owner, spender, value)`, `allowance(owner, spender)`, `transfer(from, to, value, memo?)`.
- **There is no separate `transfer_from`.** When another contract calls `transfer`, the token first spends an existing allowance for `(from → caller)`; otherwise it falls through to authority checks.
- So a Mana Station contract **can pull** funds after the user `approve`s the station, by calling `vUSDT.transfer(from=buyer, to=station, value=price)` from inside `buy_*`.

### Evidence these tokens support it

- On-chain ABI meta for both vUSDT and vUSDC lists `approve` (`0x74e21680`) and `allowance` (`0x32f09fa1`).
- KoinDX token list sets `"allowance": true` for both.
- Recent account history shows many `token.approve_event`s immediately before transfers (classic DEX approve-then-swap).

**Answer:** Yes — KCS-4-style allowances work. Preferred UX for phase 1 prepaid:

1. **Same transaction, two operations (push):**  
   - Op1: `vUSDT.transfer(from=buyer, to=station, value=X)` (buyer signs).  
   - Op2: `station.buy_days(token=vUSDT, days=N, amount=X, …)`.  
   Station verifies payment with a **balance-delta / accounted-balance** check (below).
2. **Same transaction or prior approve, then pull:**  
   - OpA: `vUSDT.approve(owner=buyer, spender=station, value=X)`.  
   - OpB: `station.buy_days(...)` which internally calls `vUSDT.transfer(from=buyer, to=station, value=X)`.  
   Payment verification is intrinsic (transfer reverts ⇒ buy reverts).

Either is atomic in one Koinos transaction if both ops are included together.

---

## 5. How Mana Station verifies prepaid payment atomically

### 5.1 Recommended pattern A — pull inside `buy` (simplest safety)

```
tx operations:
  1) token.approve(owner=buyer, spender=station, value=price)   // skip if allowance already enough
  2) station.buy_days({ token, days, price, beneficiary })
        inside buy_days:
          require(token in {vUSDT, vUSDC});
          require(price == days * price_per_day[token]);  // or quote from config
          token.transfer(from=buyer, to=station_treasury, value=price);  // pulls allowance
          grant_or_extend_access(beneficiary, days);
```

- If transfer fails (no allowance / insufficient balance), the whole tx reverts — no free days.
- Station never trusts a memo or an off-chain receipt for the on-chain grant.
- Treasury can be the station contract itself or a dedicated Carl-controlled address (`fee_recipient` in config).

### 5.2 Recommended pattern B — push + accounted balance (no approve UX)

```
storage: accounted_balance[token]   // last settled treasury balance

tx operations:
  1) token.transfer(from=buyer, to=treasury, value=price)
  2) station.buy_days({ token, days, price, payer=buyer })
        inside buy_days:
          bal = token.balance_of(treasury);
          require(bal >= accounted_balance[token] + price);
          accounted_balance[token] += price;
          // optional: require System.getCaller() empty / payer signed / first op matched
          grant_or_extend_access(payer, days);
```

- Prevents “claim days without paying” because `accounted_balance` only advances when surplus ≥ price.
- Prevents double-claim of the same surplus: second `buy` in a later tx sees no new surplus.
- **Same-tx ordering matters:** transfer must be a prior operation in the same transaction so the surplus exists before `buy_days` runs.
- Hardening: also require `payer == tx signer` (or an explicit signed voucher) so a third party cannot buy days for themselves using someone else’s mistaken transfer.

### 5.3 What not to do

- Do **not** grant access based only on an event log the contract cannot see from another op without reading state.
- Do **not** accept the legacy USDT address.
- Do **not** hold user funds as a custodian beyond the prepaid service credit; sweep income to Carl’s wallet on a schedule (withdrawal entry point, owner-only).

### 5.4 Fees / big-upload interaction

- Daily allowance purchase: price × days; `access_until = now + days` (or extend if already active).
- Big-upload one-shot: separate entry point `buy_big_upload({ token, price })` that draws from the station’s reserve budget per Orchestrator’s design, gated by prepaid receipt of `price` in vUSDT/vUSDC using the same verification pattern.
- Config should store token addresses and `price_per_day` / `big_upload_price` as mutable owner params so Monetization can change prices without redeploying tokens.

---

## 6. Regulatory / honesty notes (not legal advice)

Flags for Monetization / Carl / counsel — **not** a legal opinion:

1. **Bridged ≠ native.** Marketing and checkout must say “Vortex-bridged USDT/USDC on Koinos (vUSDT/vUSDC)”, not “USDT” / “USDC”. Peg and redeem depend on Vortex (unaudited per Koinos docs).
2. **Prepaid service credit, not a deposit / stored-value / Mana token.** Align with existing monetization note: allowances are non-transferable, not redeemable for KOIN or cash, lapse when the prepaid window ends unless renewed. Avoid language that sounds like a balance that can be withdrawn.
3. **Thin liquidity / exit risk.** Be honest in UI: converting received vUSDT back to fiat may require KoinDX (low depth) then Vortex redeem then a CEX. Disclose slippage and bridge risk.
4. **Jurisdiction.** Accepting crypto for a commercial service can trigger money-transmitter, MSB, tax, and consumer-protection rules depending on where Carl and the buyers are. Fiat MoR (e.g. Paddle) was already preferred in `monetization_legal.md` for tax handling; on-chain stablecoin payment shifts that burden back onto Carl — get a lawyer/CPA before mainnet billing.
5. **Sanctions / OFAC.** If offering a paid public service, consider whether any screening of counterparties is required; on-chain addresses alone are weak identity.
6. **No yield / no custody pitch.** Do not frame prepaid vUSDT as earning, staking, or safeguarded deposits.
7. **Refunds.** Decide and publish: prepaid days non-refundable once access is granted, or prorated off-chain. On-chain auto-refund adds complexity and more token transfers.

---

## 7. Recommendation

| Decision | Recommendation |
|---|---|
| Accept for prepaid? | **Yes — vUSDT as primary, vUSDC as optional secondary** |
| Addresses to hardcode / config | vUSDT `12VoHz41a4HtfiyhTWbg9RXqGMRbYk6pXh`, vUSDC `1N8iYrYEJdCVK1rhbqv3qZUzHcpoeKmFnj` (8 decimals) |
| Reject | Legacy `19WrWze3XAoMa3Mwqys4rJMP6emZX2wfpH` |
| Payment mechanic | KCS-4 **approve + pull `transfer` inside `buy_*`**, or **push transfer + accounted-balance** in the same tx |
| Liquidity posture | Expect **small** invoices only until depth grows; big-upload priced carefully; Carl may need to leave proceeds in vUSDT or bridge out via Vortex rather than dump into the ~$6k pool |
| Legal | Treat as prepaid crypto service fees; counsel before public paid launch; honest bridge/peg copy |

### Items that still need Carl / Monetization

1. Price per day and big-upload price in vUSDT (and whether vUSDC is enabled at day one).  
2. Whether treasury is the station contract or a separate Carl address.  
3. Lawyer OK on accepting bridged stables vs fiat MoR only.  
4. Refund / lapse policy text for the checkout UI.

---

## 8. Source index

- KoinDX token list: https://raw.githubusercontent.com/koindx/token-list/main/src/tokens/mainnet.json  
- tokens.koindx.com: https://tokens.koindx.com/mainnet.json  
- KoinDX v2-sdk addresses / ABIs: https://github.com/koindx/v2-sdk  
- KCS-4: https://github.com/koinos/koinos-contract-standards/blob/master/KCSs/kcs-4.md  
- Koinos token guide: https://docs.koinos.io/developers/guides/token/  
- Kondor (Vortex naming): https://kondorwallet.com/  
- Koinos Vortex disclaimer / bridge guide: https://koinos.io/get-koin  
- Vortex: https://vortexbridge.io/  
- RPC: `https://api.koinos.io`, `https://rest.koinos.io` (User-Agent set; methods `chain.read_contract`, `contract_meta_store.get_contract_meta`, `account_history.get_account_history`)

*End of research note. Nothing was spent, signed, or deployed.*
