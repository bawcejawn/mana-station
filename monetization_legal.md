# Mana Station: monetization and legal (compact, 19 Oct 2026)
- **Full detail and sources:** `/workspace/koinos/mana_station_design_2026-10-19.md` (§ references below point there).
- **Labels:** [V] verified, [M] measured on mainnet, [U] needs a testnet measurement, **EXAMPLE** = illustrative. *Not legal advice. ⚖ = lawyer.*
- **Status:** nothing was bought, deployed or sent.

## 1. Provider fee model (low to start; all in `fee_schedule.json`)
- **Capacity:**
  - KOIN needed = actions/day × Mana per action ÷ 0.20. Mana = KOIN balance and refills linearly to full in 5 days [V docs, Koin.ts].
  - A typical action costs ~1.1 Mana [M]. Our contracts plus authorize overhead must be measured on testnet [U].
- **Ladder (EXAMPLES):**

| Tier | Price | What's included |
|---|---|---|
| Free | $0 | ≤100 actions/day per app |
| Indie | **$5/mo** | ≤1,000/day |
| Studio | **$25/mo** | ≤10,000/day |
| Overage | **$0.50 per 1K** | Hard cap at 2× the plan |

  These are plan allowances: non-transferable, not redeemable for KOIN or cash, unused allowance lapses monthly. **No prepaid transferable "Mana credits"** (that looks like stored value; Paddle's AUP bans it [V]).
- **Recommendation: flat monthly plan per app + optional capped overage.**
  - EVM paymasters charge real gas plus a % (thirdweb +2.5%, Alchemy 8%, Pimlico 10%, Gelato 8–20% [V]). Koinos Mana has no per-action cash cost, so a % fee has nothing to apply to.
  - Price increases need 30 days' notice; decreases apply immediately. Every version is published.
- **Honest ceiling:** the chain does ~219 transactions/day, 83% already sponsored [E]. Even 10 apps × $5 = $50/mo. A strategic or ecosystem tool, **not a $20k/mo line**.
- **Billing options:**

| Option | Verdict | Notes |
|---|---|---|
| Fiat via merchant of record (Paddle) | GREEN if accepted | Handles sales tax; crypto-adjacent approval is [U] |
| Stripe | GREEN–YELLOW | Mining/staking prohibited; avoid staking framing [V] |
| KOIN paid directly to the provider's own address | GREEN–YELLOW | Income at fair market value; sales tax on Carl ⚖/CPA |

## 2. Anti-spam economics: phase-1 sizing for Carl's 30,000-KOIN station
> **Superseded by `BUILD_PLAN.md` and Carl's 3:36 PM answers:** per-user 25 actions / 50 Mana a day; per-transaction cap 3 Mana; server co-signature parked until phase 2; **no fixed 3,000/day station cap** (dynamic limits, §7(3)); station publicly labelled. The figures below are the original sizing.

- **Capacity:**
  - 30,000 Mana max, **6,000 Mana/day refill** (250/h).
  - At 1.1 Mana/action that's 5,455 actions/day; with an EXAMPLE 0.3 authorize overhead, 4,286.
  - **Safe budget = 50% of refill = 3,000 Mana/day ≈ 2,100–2,700 actions/day.** The station stays ≥~90% full, and ≤~3,000 KOIN is locked at any time, unlocking within ~12 h.
- **On-chain `authorize` (the last line of defense):**
  - only allowlisted contract + entry point;
  - **relayer co-signature required**;
  - per-transaction `rc_limit` ≤10 Mana;
  - per-user, per-app and station daily counters;
  - **never approves KOIN/token transfers**;
  - owner kill switch.
- **Off-chain relayer:**
  - simulate and pre-filter before submitting (assume rejected transactions still cost Mana until tested [U]);
  - signed app keys;
  - IP/device limits;
  - invisible checks → captcha → email only above the starter budget (first play is never gated).
- **Defaults (EXAMPLES):**
  - **Budgets:** station 3,000 Mana/day. Knode 1,500, SwarmTales 1,000, Carl's tests 500.
  - **Users:** 20 actions or 30 Mana/day (10 in the first 24 h).
  - **Bursts:** user ≤5/min and ≤20/h; app ≤60/min; station ≤500 Mana/h.
  - **Reserve floor:** stop below **70% Mana (21,000)** and resume above 85%.
  - **Breakers:**
    - hourly burn >500 → 60-min pause;
    - daily budget hit → pause to 00:00 UTC;
    - app reject/revert >20% in 15 min → pause the app;
    - >50% of actions from new accounts → captcha on;
    - 3 forbidden-op attempts from one app key in 1 h → revoke the key.
  - Alerts at 50/75/90/100% of budget.
- **Users with Mana can choose their own.** Sponsorship is offered only when the user's Mana is short, or when they opt in (the Kondor pattern [V]).
- **No app deposits held by Carl** (custody). Use fiat plans via the MoR plus throttling instead.
- **Keys:**
  - **A dedicated station contract account, not Carl's main wallet.**
  - Hot relayer key: can only spend Mana within caps.
  - Cold owner key: withdraw, limits, contract re-upload [V re-upload is possible].
  - Fully cold KOIN can't sponsor; it needs automatic authorization.
  - Start with ~3,000 KOIN (EXAMPLE), then top up.

## 3. Legal read: providers charging for Mana
- **Positioning:** a usage-based infrastructure service (like an RPC or paymaster provider). Not an investment, deposit, loan, interest or yield.
- **Plain service fee, not lending or yield, if ALL of these hold:**
  - (a) KOIN never leaves the provider's own account. Mana can't be transferred [V], so nothing is lent or repaid.
  - (b) The fee is priced per plan or action, not as a % of KOIN held or over time.
  - (c) Providers run their own stations and set or opt in to prices.
  - (d) No pooling or cross-provider revenue share; no utilization promise.
  - (e) No APY, "earn" or "interest" wording.
  - Breaking (a) or (d), e.g. "deposit KOIN with us and share fees", creates investment-contract (Howey) and custody risk = RED.
- **Money transmission:**
  - Carl holds no customer funds.
  - Fiat goes through an MoR; KOIN goes directly to the provider.
  - No fee-split contract in the payment path (YELLOW–RED ⚖).
  - The station never pays value to users (FinCEN 2019 framing ⚖).
- **Required terms:**
  - service scope and caps;
  - best effort on Free; paid plans get credits only (e.g. a pro-rata credit if availability is <99%, EXAMPLE);
  - not-financial clause;
  - fee changes with 30 days' notice;
  - AUP;
  - users always sign;
  - liability cap;
  - data and privacy;
  - termination and right to cut off;
  - governing law ⚖.
- **Verdicts:**

| Model | Verdict |
|---|---|
| Phase 1 (own apps) | **GREEN** |
| Phase 2 plans via MoR | **GREEN** |
| Phase 2 billed in KOIN | **GREEN–YELLOW** |
| Phase 3 independent self-custody providers | **YELLOW** (lawyer first) |
| Pooled or APY models | **RED** |

- **Third-party apps later (⚖ before phase 2):**
  - **App Sponsorship Terms:** allowlist; app warrants its contracts are lawful; the app's own ToS discloses the sponsor; no endorsement; indemnity; instant suspension for abuse; sanctions reps.
  - **End-user disclosure:** "Network fees are paid by Mana Station, operated by [Carl/entity] for [App]."
  - **Facilitation risk:** AUP (no gambling, token sales, mixers, scams, adult content, IP infringement or sanctioned parties), review each contract before allowlisting, monitoring, right to cut off.
  - **Sanctions:** light KYB plus an OFAC Sanctions List Search check, and IP blocks for sanctioned jurisdictions.
  - **Privacy:** addresses + IPs are personal information. Log minimally (EXAMPLE 30-day raw retention), no sale, privacy notice, US-only first.

## 4. Disclosures when Carl's station sponsors users (for the Designer)
- **Users:**
  - "Free to use: network costs (Mana) are covered by [App]'s sponsor, Mana Station account `[address]`. You sign every action; the sponsor can't access your account or assets. Sponsorship may be limited or end. You can always use your own Mana."
- **Apps:** which station pays, caps and usage, best-effort terms, 30 days' notice to end paid plans (immediate for abuse), kill-switch policy.
- **On-chain:** the payer address is public and permanent on every sponsored transaction. It links the station (and Carl, if named) to each app and user address. No personal data goes on-chain.
- **Privacy:** relayer logs (address, IP/device, app key, optional email) are used for abuse prevention only, with limited retention and no sale.
- **Withdrawal:** Carl or any provider can pause or end sponsorship at any time. Users keep their accounts and assets, and the app shows an honest fallback.

## 5. Designer Q&A
1. **Service fee, not lending or yield?** Yes, if conditions (a)–(e) in §3 all hold ⚖.
2. **Monthly or per 1K?** Verified benchmarks:
   - thirdweb: Starter $5, Growth **$99/mo** (a bundle, not a sponsorship price). Sponsorship: 1K transactions included, then **$1 per 1K**, $0.60 above 100K, $0.20 above 250K, plus a 2.5% gas surcharge [V thirdweb.com/pricing].
   - Alchemy: 8% on gas. Pimlico: ~$0.0105 per sponsored operation + 10%. Gelato: $0/$99/$399 plans with a 20/10/8% gas premium. Biconomy: post-paid at actual usage [V].
   - **Recommendation:** monthly plan with included daily actions, plus optional capped per-1K overage (EXAMPLES in §1).
3. **Station runs dry mid-session:**
   - **Who's responsible:** the station operator for capacity, the app for user messaging, the relayer for checking available Mana before every transaction. It returns `SPONSOR_UNAVAILABLE` + ETA before the user signs. Reverts still charge the payer up to the failure point [V].
   - **Fallback order:** backup station → the user's own Mana → Kondor's own free-Mana option (user's choice) → queue and auto-retry. ETA = Mana needed ÷ (0.2 × balance per day).
   - **Copy:** "Free actions are paused for a bit: our sponsor's daily allowance ran out. Try again in about 2 hours, or continue now with your own Mana." Never "network error", never "unlimited".
   - **SLA:** Free = best effort. Paid = credit if availability is <99% (EXAMPLE), and credits are the only remedy.
4. **Terms: KOIN lock (correction).**
   - The draft wording is wrong in two ways: the lock is **partial and gradual**, and KOIN isn't held back "until fully refilled."
   - A transfer needs `mana ≥ amount` [V Koin.ts]. Mana refills linearly at 20% of the balance per day.
   - So locked KOIN = Mana used, which unlocks in **Mana used ÷ (0.2 × balance) days, at most 5**. Example: 30,000-KOIN station uses 3,000 Mana → 3,000 locked, unlocked in ~12 h.
   - **Clause:** "Your KOIN stays in your own station account; we never take possession of it and none is lent or transferred. Fees are payment for the sponsorship service you provide, not interest, yield or a return on your KOIN, and no level of use or income is guaranteed. Covering a transaction uses Mana, which makes an equal amount of your KOIN temporarily non-transferable. Mana refills continuously at 20% of your station's balance per day, so locked KOIN unlocks gradually: at most 5 days, usually much less. You can withdraw unlocked KOIN at any time; pausing the station lets the rest unlock."

## 6. Everything that needs Carl's spend (or action) approval
1. **Buying any of the 30,000 KOIN** not already held (~$600 at an EXAMPLE $0.02; thin market).
2. **Moving KOIN** to the station account. This is an on-chain action and reduces main-wallet KFS vote weight [U].
3. **Contract deployment** on mainnet (Mana only, from his KOIN).
4. **Relayer hosting** beyond free tiers [U]; domain (~$10–20/yr [U]).
5. **Paddle and/or Stripe sign-up** (free to join but a sign-up; fees are per sale).
6. **Captcha or monitoring** beyond free tiers [U].
7. **Lawyer review** of the ToS, App Sponsorship Terms and the phase-3 structure ⚖ (get a quote first).
8. **Optional contract audit** [U cost].
9. **Any publication** of the station address under his name.

## 7. Platform take-rate (Carl's ask, 19 Oct 15:37 UTC)
> **PARKED (19 Oct 16:15):** Carl's allowance model (next section) replaces the provider marketplace for now. Keep this section for a later phase 3.
Carl: *"the platform itself should profit from every time someone else profits… the mana station needs a cut of those profits"*, with **no fixed station cap**.

**Aligned with `BUILD_PLAN.md`**, which supersedes my earlier defaults:
- per-user limit 25 actions / 50 Mana a day;
- per-transaction cap 3 Mana;
- the server co-signature is parked until phase 2;
- the station address is publicly labelled as the sponsor of Carl's apps.

All numbers are **EXAMPLES/EST**. ⚖ = lawyer.

### (1) Take-rate model
- **What the platform charges for:** real services it performs. These are routing an app to a station, metering usage, billing, abuse protection (caps, auto-pauses, monitoring) and the provider directory. The take rate is the price of those services. **It is never a share of returns on KOIN.**
- **Where the cut comes from:**
  - **(a)** A **% of every usage-based or subscription fee** an app pays a third-party provider *through the platform*.
  - **(b)** **100% of fees on Carl's own station.** He's the provider, so there's no split.
  - **Minimum:** $1 per paying app account per month (EXAMPLE), so tiny accounts still cover billing costs.
  - **0% on the free tier.**
- **How a provider using its own Mana earns:**
  - The provider sets its own price P (per 1,000 actions or per plan). The app pays P.
  - The platform's fee = take % × P, metered by the platform's router.
  - Example: P = $1 per 1,000 and take = 10% → the provider keeps $0.90, the platform gets $0.10.
  - Usage the provider serves *outside* the platform carries no fee. The platform has to earn its cut by being worth using.
- **Benchmarks** [V]:

| Comparable | Take |
|---|---|
| Apple App Store | 30% standard; **15%** for developers under $1M/yr (https://developer.apple.com/app-store/small-business-program/) |
| Google Play | 15% on the first $1M (30% above); subscriptions 10% + 5% billing in updated markets (https://support.google.com/paymentscenter/answer/112622) |
| Stripe Connect | The platform sets its own fee. Stripe charges the platform **$2 per active account/mo + 0.25% + 25¢ per payout** under "you handle pricing" (https://stripe.com/connect/pricing) |
| Pocket Network (relay marketplace) | Each relay settlement: suppliers **79%**, validators 14%, DAO **4.5%**, source owner **2.5%**. So ~7% goes to non-supplier "platform" roles, plus a 2.5% burn (https://docs.pocket.network/governance/parameters/). Token-incentive design, **not a model to copy legally** |
| Lava Network | Not verified |
| Paymaster markups | thirdweb 2.5%, Alchemy 8%, Pimlico 10%, Gelato 8–20% (§5 Q2 sources); Biconomy has no published surcharge |

- **Recommendation:** start at **10%** (EXAMPLE).
  - It's in the paymaster range (8–10%) and below app stores (15–30%).
  - Config field: `platform_take_rate`.
  - Changes need 30 days' notice. It's published and versioned, and a rate already in force is **never raised retroactively**.
  - Optional launch promo: 0% for the first 90 days for providers that join.
- **Optional revenue share on apps' own earnings** (the app-store-style cut):
  - **Contract-only and opt-in**, e.g. **2–5% of in-app revenue from sponsored users** *instead of* per-1,000 fees (EXAMPLE).
  - It's **hard to measure and enforce**. Revenue happens off-chain (PayPal, stores), and "attributable to sponsored usage" needs agreed attribution rules, the app's billing reports and audit rights.
  - It must be disclosed in the App Sponsorship Terms.
  - **Not at launch.** Offer it only on request.
  - This cut goes to the platform for its services. It's never passed through to KOIN holders as passive profit.

### (2) Example revenue (EST, honest)
**Base:** ~219 transactions/day × 83% sponsored ≈ **182 sponsored/day ≈ 5,450/month** [E].

| Volume | Sponsored tx/mo | Usage fees at $0.50 / $1 / $2 per 1K | Platform's 10% of third-party usage | Subscriptions (EXAMPLE apps × avg plan) | **Platform total/mo (EST)** |
|---|---|---|---|---|---|
| Today (1×) | 5,450 | $2.73 / $5.45 / $10.91 | $0.27–1.09 | 5 apps × $5 = $25 | **~$25–35** |
| 10× | 54,500 | $27 / $55 / $109 | $2.73–10.91 | 20 × $10 = $200 | **~$200–310** |
| 100× | 545,000 | $273 / $545 / $1,091 | $27–109 | 100 × $25 = $2,500 | **~$2,500–3,600** |

- **Ranges:** the lower end assumes all usage goes to third-party providers (platform keeps 10%). The upper end assumes Carl's own station serves it (keeps 100%).
- **Capacity check:**
  - At 100×, sponsored demand is ~18,200/day × ~1.4 Mana ≈ 25,500 Mana/day.
  - That needs **~127,000 KOIN held** (at 100% of refill).
  - Carl's 30k station covers ~4,300/day at full refill. **Third-party providers or more KOIN (a purchase needing Carl's OK) would be needed.**
- **What "meaningful" takes:**
  - **$1k/mo:** ~40 paying apps at $25, **or** ~1M sponsored tx/mo (~33k/day, **~180× today**) at $1 per 1K kept in full.
  - **$20k/mo:** ~800 paying apps at $25, **or** ~667k sponsored tx/day (**~3,700× today**). That would also need ~3.7M KOIN held (~4% of supply), which isn't realistic in the near term.
  - **Conclusion:** the take rate is right to build in from day one. But revenue tracks Koinos usage. It only becomes meaningful if the chain grows ~100×+ or Mana Station also serves off-chain (Web2) customers.

### (3) "No fixed cap": dynamic, revenue-backed limits
1. **No arbitrary station ceiling.** Daily spend can go up to what the KOIN supports: the refill (30k → 6,000 Mana/day), never below the reserve floor.
2. **Two pools:**
   - **Free/sponsored pool** (Carl's gift to users of his apps, plus the free tier). This **stays capped**: EXAMPLE ≤50% of refill = 3,000 Mana/day, plus the BUILD_PLAN per-user limit of 25 actions / 50 Mana a day.
   - **Paid pool:** each paying app's allowance = what it pays or prepays for the period (plan actions/day, or prepaid per-period allowance via the MoR). It scales with revenue up to the remaining refill.
3. **When paid demand outgrows the station**, that's a signal to add KOIN (Carl's approval) or route to other providers. **It's never a reason to lower the floor.**
4. **Always on:**
   - per-user and per-app caps;
   - per-transaction cap (3 Mana);
   - burst limits;
   - **70% reserve floor**;
   - auto-pauses (hourly burn, reject rate, new-account surge);
   - kill switch.
5. **Why some limits can't be removed (plain words):**
   - The station's Mana is finite (6,000/day for 30k).
   - **Koinos accounts are free to create**, and in phase 1 there's no server co-signature. So one script could make thousands of "users" and use up a whole day's refill in minutes.
   - Per-user caps alone can't stop that. Per-app and station-wide brakes are what protect Carl's KOIN.
   - The floor keeps Carl's KOIN unlockable within a day or so.
   - Like "unlimited" phone plans, paid usage scales with payment, but fair-use protection stays.

### (4) Legal framing (⚖; phase 3 stays behind a lawyer review)
- **Fee for services, never yield:**
  - The take rate is priced on routed or metered usage and on platform services.
  - It's **never a % of KOIN held, never time-based, never a share of pooled returns**.
- **Providers:** keep custody and keys, set their own prices, choose which apps to serve, and accept the terms. **No "earn", "APY", "passive income" or "rewards" wording** in any provider marketing.
- **Collecting on providers' behalf = payout/money-transmission risk** (FinCEN 2019 framing ⚖). Options:

| Option | How it works | Verdict |
|---|---|---|
| **A (preferred):** direct billing | Providers bill apps directly; the platform invoices **its own fee** to the provider (or app) separately from its meter. The platform never touches provider money | **YELLOW** (lawyer review of the structure) |
| **B:** Stripe Connect marketplace | Stripe handles KYC and payouts, and the platform takes an application fee | **YELLOW** (needs Stripe approval: crypto-adjacent; staking/mining framing prohibited [V]) |
| **Paddle as a marketplace** | — | **Not available.** Paddle's AUP prohibits products that let non-Paddle sellers sell, "such as digital marketplaces" [V] |
| **C:** on-chain split contract | The platform contract receives KOIN and forwards the provider's share | **YELLOW–RED** ⚖ |

- **Tax:**
  - Platform fees are Carl's business income.
  - Under option B, Stripe as the settlement organization files 1099-Ks for providers only above **$20,000 and 200 transactions a year** (federal; states can be lower) [V https://www.irs.gov/newsroom/irs-issues-faqs-on-form-1099-k-threshold-under-the-one-big-beautiful-bill-dollar-limit-reverts-to-20000].
  - If Carl ever pays providers himself, other 1099 duties may apply [U/CPA]. Option A avoids payouts entirely.
- **Securities angle with passive providers:**
  - If providers only park KOIN while the platform does everything (pricing, matching, operations) and pays them fees, that looks like **profit from the efforts of others** (Howey), even without pooling.
  - Keep providers **active operators**: they run their own station, set price and app choices, and get no utilization promise. The platform's role stays ministerial (routing and metering).
  - **"Deposit and earn" = RED.**
- **Verdicts:**

| Variant | Verdict |
|---|---|
| Fees on Carl's own station (phase 2) | **GREEN** |
| Take rate via option A with active providers | **YELLOW** |
| Option B (Stripe Connect) | **YELLOW** |
| Opt-in contract revenue share on apps' earnings, disclosed | **YELLOW** (enforceability) |
| Option C (split contract) | **YELLOW–RED** |
| Passive "deposit KOIN, platform does the rest, get paid" | **RED** |
| Any take or payout computed on KOIN held or over time, or APY marketing | **RED** |

### (5) New spend approvals (added to the list)
- **Stripe Connect sign-up** (if option B): $2 per active provider account/mo + 0.25% + 25¢ per payout, plus normal card processing [V].
- **Lawyer review** of the take-rate and marketplace structure (phase-3 gate).
- **CPA review** of 1099 duties (if any payouts).
- **Any KOIN beyond the 30k** for paid capacity (a purchase).
- **Metering and billing tooling** beyond free tiers [U].

## 8. Mana allowance pricing (Carl's model, 19 Oct 16:15 UTC; replaces the provider marketplace for now)
**Model:**
- Carl is the only provider.
- Buyers prepay **(a)** a daily allowance (per 1,000 Mana/day, for N days; it stops at expiry unless renewed, with no auto-renew), or **(b)** a one-time **big upload** outside the daily limit.
- Payment in **vUSDT/vUSDC**.
- Daily spend is ≤20% of station Mana (= the refill). ~24k reserve. Carl's apps get 3,000 Mana/day each.

All prices are **RECOMMENDATIONS, adjustable in config**. ⚖ = lawyer, CPA = accountant.

### (1) Cost basis per 1,000 Mana/day
- **KOIN needed:** 1,000 ÷ 20% refill = **5,000 KOIN** [V: Mana docs; Koin.ts regenerates balance/5 days].
- **KOIN price (19 Oct 2026):**
  - **$0.0210** from DeFiLlama, vKOIN on Ethereum/Base, 16:07 UTC (https://coins.llama.fi/prices/current/ethereum:0xa50ad3a559A10f384a5bB2e27516f63E0B937b1A).
  - DexScreener: $0.0208, Uniswap liquidity ~$56K + $8K, 24h volume ~$250 (https://api.dexscreener.com/latest/dex/tokens/0xa50ad3a559A10f384a5bB2e27516f63E0B937b1A).
  - CoinGecko's $0.0419 is stale (last updated 27 Mar 2026).
  - **Range used: $0.015–0.03.**
  - 5,000 KOIN ≈ **$105** (range $75–150).
- **Opportunity cost:**
  - **Forgone producer yield:** producers get 2% inflation a year [V https://peakd.com/koinos/@jga/the-koinos-fund-system-is-live]. Spread over VHP 22.14M against KOIN + VHP 85.59M [V api.koinos.io total_supply today], that's an **≤7.7%/yr upper bound** (my arithmetic, unverified against actual payouts). Earning it means burning KOIN (one-way) and running a node.
    - 5,000 × 7.7% = 386 KOIN/yr ≈ **$8/yr ≈ $0.022/day**.
  - **KFS voting:** weight = KOIN + VHP in the voting wallet. KOIN in the station is lost to Carl's main wallet unless the station account can vote [U].
  - **Price risk:** EXAMPLE premium of 10–20%/yr on $105 = **$0.03–0.06/day**.
- **Cost floor: ≈ $0.02–0.08/day per 1,000 Mana/day (~$0.60–2.40/mo).** Ops cost is ~$0 (free hosting).

### (2) Comparables and realistic demand
- **Kondor free Mana ($0):**
  - The @freemanasharer pool holds ~12,500 KOIN, about 2,500 Mana/day shared by everyone, with a **100-Mana cap per transaction** [E].
  - **Small users won't pay.**
  - **Who might:** apps that need guaranteed capacity (no queue or contention), a dedicated daily allowance, or bulk uploads above the 100-Mana cap (NFT mints, data anchoring).
- **Buy KOIN yourself:**
  - Hold 5,000 KOIN (~$105, recoverable apart from price moves).
  - The cost is the Vortex bridge (unaudited per its own disclaimer [V https://koinos.io/get-koin]), ETH gas, slippage and a round trip.
  - **So renting wins for short periods. A long-term buyer would rather just hold KOIN**, which caps sensible pricing at roughly the yearly cost of self-holding (~$20–30/yr).
- **Other chains:**
  - Pimlico: ~$0.0105 per sponsored operation + 10% of gas (https://docs.pimlico.io/guides/pricing).
  - Alchemy: 8% of gas (https://www.alchemy.com/docs/wallets/reference/gas-manager-faqs).
  - Gelato: 8–20% gas premium (https://docs.gelato.cloud/pricing/pricing-plans).
  - Biconomy: post-paid usage (https://docs.biconomy.io/gasless-apps/payments).
  - At Pimlico's per-operation fee, ~27K actions/mo (≈1,000 Mana/day) would cost ~$285/mo before gas. Koinos is far cheaper.
- **Demand reality:**
  - The whole chain does ~219 transactions/day [E] × a mean of 4.93 Mana [M] ≈ **~1,100 Mana/day in total**. That's about **one** 1,000-Mana/day allowance.
  - Expect **0–3 buyers** plus occasional big uploads.

### (3) Recommended prices (1,000 Mana/day ≈ 900 typical actions/day at ~1.1 Mana each [M; testnet to confirm])
| Allowance per 1,000 Mana/day | Price (RECOMMENDED) | Per day | Discount |
|---|---|---|---|
| 1 day | **$0.25** | $0.25 | — |
| 7 days | **$1.50** | $0.21 | ~14% |
| 30 days | **$5.00** | $0.17 | ~33% |

- That's ~3–10× the cost floor and ~$0.19 per 1,000 actions on the 30-day plan.
- **Minimum order:** $1.
- **Big upload:**
  - **$0.50 per 1,000 Mana** one-time (2× the 1-day rate, for drawing down stock).
  - **Minimum 5,000 Mana ($2.50).**
  - **Cap per order** = (station Mana now − reserve floor) − (the next 24 h of committed allowances + Carl's apps). Above that, deliver in scheduled chunks over several days.
  - Example: 10,000 Mana ≈ 9,000 typical actions for $5.

### (4) Capacity check (two Carl apps × 3,000 = 6,000 Mana/day)
**Ambiguity, for Carl:** "~24k reserve" could mean three things:
- **(A)** a 24,000-**Mana** floor. On a 30k station that's exactly balance − one day's refill (80%), so it matches "spend only the 20% refill".
- **(B)** 24k **KOIN** set aside and not used for sale.
- **(C)** a floor of 80% of whatever the balance is.

| Station KOIN | Refill/day | − Carl apps | **Sellable Mana/day (A or C)** | Max revenue/day at $0.17–0.25 per 1K | If (B): sellable = (KOIN − 24k) × 0.2 − 6,000 | Big-upload stock above floor (A) |
|---|---|---|---|---|---|---|
| 30,000 | 6,000 | 6,000 | **0** | $0 | −4,800 (none) | ~6,000 (one day's refill) |
| 50,000 | 10,000 | 6,000 | **4,000** | $0.67–1.00 (~$20–30/mo) | −800 (none) | ~26,000 |
| 100,000 | 20,000 | 6,000 | **14,000** | $2.33–3.50 (~$70–105/mo) | 9,200 | ~76,000 |

- **Key flag: at 30k KOIN, Carl's two 3,000-Mana app reservations use the whole refill. Nothing is left to sell.**
- Fix: treat Carl's 3,000/day as a **cap, not a reservation**. His apps realistically use far less, since the whole chain uses ~1,100/day. Then sell only *guaranteed* allowances backed by spare refill, and let big uploads use any unused headroom. Alternatively, grow the station (adding KOIN is a purchase if not already held).

### (5) Legal and tax (keep it a service sale)
- **Product terms:**
  - The allowance is a **non-transferable right to have the station pay Mana** for a registered account or app.
  - No resale, not redeemable for crypto or cash, no stored value, no cash-out.
  - **Refunds only if Carl fails to deliver** (pro rata, same token, to the paying address); otherwise non-refundable. Stated before purchase.
  - **Never marketed as an investment**, and no KOIN price talk.
- **Money transmission:**
  - FinCEN FIN-2019-G001 [V https://www.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf] treats a "user" who uses CVC "to purchase goods or services" on its own behalf as **not** a money transmitter. Transmission means accepting and transmitting value *to another person*.
  - Taking stablecoins as payment for Carl's **own** service is the merchant side of that and generally isn't transmission ⚖.
  - It changes if Carl holds balances for others, pays out to third parties, or exchanges coins for customers.
- **Tax (CPA):**
  - Stablecoin receipts are income at fair market value when received (IRS Notice 2014-21 [V https://www.irs.gov/pub/irs-drop/n-14-21.pdf]). That becomes the coins' basis, and later conversion gives a small gain or loss.
  - Prepaid days are deferred revenue for accrual-basis books (cash basis: taxable on receipt).
  - Some states tax SaaS or digital services: check Carl's state.
- **Stablecoin risk:**
  - vUSDT/vUSDC are wrapped through Vortex [V https://kondorwallet.com/], and Vortex is unaudited [V koinos.io/get-koin].
  - Bridge failure, a depeg, or the issuer freezing the backing on Ethereum could make receipts worthless.
  - Mitigate: accept only the verified Koinos contract addresses (the name "vUSDT" also belongs to an unrelated Venus token on BNB Chain), sweep receipts regularly, and keep the right to suspend acceptance if the peg breaks.
- **Sanctions:**
  - OFAC duties apply to crypto payments too (https://ofac.treasury.gov/faqs/topic/1626).
  - Before accepting, check the buyer's name or app against SDN search, use a ToS attestation, block sanctioned regions by IP where there's a site, and refuse flagged addresses.
- **ToS and consumer protection:**
  - Price in USD, shown with the token amount.
  - State exactly what 1,000 Mana/day buys (≈900 typical actions, an estimate).
  - **"Your allowance stops at expiry unless you renew. No automatic renewal or charges."** No auto-renew keeps it outside auto-renewal laws (e.g. California's).
  - No "unlimited" claims. Include the AUP, cut-off rights, and a liability cap.
- **Verdict:** **GREEN–YELLOW.**
  - The service-sale structure is green.
  - Yellow for stablecoin bridge/depeg risk, sales tax, and sanctions screening.
  - **RED** if allowances become transferable, tradable, refundable as crypto on demand, or promoted as an investment.

### (6) Spend approvals
- **None needed to start**: deployment Mana comes from Carl's KOIN.
- **Needs Carl's OK:**
  - buying any KOIN to grow the station;
  - ETH gas to bridge stablecoins out;
  - a lawyer review of the ToS (optional) and a CPA check on sales tax.

## 8b. Rock-bottom launch pricing (Oct 19, 2026; replaces the §8 price table for launch)
Carl's direction: prices "crazy low," affordable to anyone, still slightly profitable, and raised later. App allocations are reservations, so unused mana isn't sold. Selling starts once Carl adds KOIN beyond the app reservations. Carl's own contracts are fee-exempt through the allowlist.

| Product | Price (vUSDT/vUSDC) | Base units (8 decimals) | Per day per 1,000 mana |
|---|---|---|---|
| 1 day, 1,000 mana/day | $0.03 | 3,000,000 | $0.030 |
| 7 days, 1,000 mana/day | $0.20 | 20,000,000 | $0.029 |
| 30 days, 1,000 mana/day | $0.75 | 75,000,000 | $0.025 |
| Big upload, per 1,000 mana (one-time) | $0.05 | 5,000,000 | n/a |
| Big upload minimum order | 5,000 mana = $0.25 | 25,000,000 | n/a |

**Why it never loses money per sale**
- **Cost floor:** about $0.022/day per 1,000 mana/day. That's the forgone producer yield on 5,000 KOIN (about $8/yr, from §8), and every tier above sits over it.
- **Price risk:** KOIN price risk isn't included, because Carl keeps the KOIN.
- **Payments:** the buyer's payment transaction runs on the buyer's own mana, so Carl pays no per-sale processing fee. The station's sponsorship mana regenerates.
- **Overhead per sale:** about $0 on Koinos. The only real overhead is bridging stablecoins out to Ethereum via Vortex (ETH gas, amount not verified). Rule: sweep only when the balance exceeds a threshold, so that gas stays under 5% of the swept amount.
- **Rounding:** prices are whole cents, well above the 8-decimal minimum unit, so there's no rounding loss.

**Honesty and legal notes**
- Label prices "introductory; may increase for new purchases."
- A prepaid term keeps its price until expiry.
- No auto-renew. Allowances are non-transferable and not cashable.
- §8 legal flags still apply: the bridge risk, OFAC screening of named buyers, and income recorded at USD value on receipt.
