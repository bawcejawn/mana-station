# Mana Station — strategy (short)

**Aligned with** `PLAN_OUTLINE.md` · **Full brief:** `/workspace/koinos/mana_station_brief_2026-10-19.md` · 19 Oct 2026

## Phase 1 recommendation (one line)

**Carl's own KOIN (sponsor contract/wallet) powers only his apps first — do not launch a multi-provider marketplace until Phase 1 works.**

---

## 1) Competitive check

| Player | Model | Limit |
|---|---|---|
| **Kondor `@freemanasharer`** (`162GhJ…`) | Free shared Mana; ~12.5k KOIN deposited; 100 Mana/tx cap; paid ~37% of sponsored txs in a 24h scan | No app allowlist, no SLA, easy to freeload; fine for wallet onboarding, not for an app budget |
| **Per-app sponsors** (OURO, Aurvania, Discover Koinos, Pulse) | App holds KOIN; server/user co-sign as payer/payee | Each team rebuilds policy; works but not reusable |
| **Wallet-side** (Kondor free-mana checkbox) | Opt-in to freemanasharer | Not default; **KOIN Vault can't set custom payer** |
| **Mana Station** | Shared policy module: allowlist, quotas, caps, pause; Phase 1 = Carl only; later SDK then optional providers | Differentiates on **controls + reuse across Carl's apps + mobile fallback**, not on beating free |

We do **not** win by charging for what freemanasharer gives away. We win by making Carl's portfolio feeless and spam-safe, then packaging that as a kit.

## 2) Who uses it beyond Carl's apps

**Near term:** nobody paying. External demand is a handful of indie dApps that already self-sponsor or lean on freemanasharer (~200 tx/day chain-wide; 83% already sponsored).

**Later (if Phase 2 SDK is good):** new builders who want copy-paste sponsorship; wallets needing a stricter free fallback; Carl's mainstream products (badges, loyalty, games) using Koinos as an invisible receipt layer — **this is the real customer**, and they are Carl's own apps.

## 3) Go / no-go by phase

**Phase 1 — Carl personal provider (now)**  
- *Scope:* one sponsor contract/wallet; allowlist Knode + SwarmTales (etc.); per-user/day caps; rc_limit; global ceiling; kill switch; wire Knode `payer`.  
- **Go:** Eng verifies contract payer can cover allowlisted calls; controls live on testnet; Carl approves KOIN reserve size (held KOIN, not a purchase unless he says so).  
- **No-go:** unsafe authorize surface, or reserve drained by abuse within 14 days despite controls.  
- **Done when:** ≥1 production app sponsors real users for 14 days with zero critical spam incidents and Mana utilization logged.

**Phase 2 — Developer kit**  
- *Scope:* JS helper, docs, mobile relayer-or-wait decision, status page.  
- **Go:** Phase 1 done-when met for 30 days; Eng picks mobile path.  
- **No-go:** Phase 1 unstable, or no second Carl app needs it within a quarter → keep Phase 1 only, skip kit polish.

**Phase 3 — Open provider network**  
- *Scope:* registry, non-custodial or deposit model, small **service fee from apps** (never "APY" for providers).  
- **Go:** ≥3 external apps *request* paid coverage in writing; Monetization + lawyer OK on fee/custody framing; freemanasharer still free (we don't pitch yield).  
- **No-go:** fewer than 3 serious asks, or counsel flags securities/MSB — stay internal + optional open-source / KFS public-good kit.

**VHP reminder:** ~500k VHP gives mining KOIN and ~45% of the KFS funding-line vote weight — **zero Mana**. Sponsorship needs liquid KOIN.

**Capital:** Phase 1 ≈ $0 extra if funded from KOIN Carl already holds or from mining rewards left liquid (his call). No spend without his OK.
