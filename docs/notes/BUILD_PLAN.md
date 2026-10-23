# Mana Station: build plan v1 (Oct 19 2026)
Sources: strategy.md, design.md, engineering.md, monetization_legal.md (this folder). Point of contact: Project Orchestrator.

## Decided (Carl, in his own words)
- 30,000 KOIN set aside to start (he says he holds it), more later. Carl is the first user.
- **Changed (Carl, 2026-10-19 4:05 PM):** the default payer is the user's own Mana when they have enough. The station is used when they don't, or when they choose it (Settings: "Use my Mana when I have enough (default)" / "Always use free play"). The station only has to be available.

## Recommended, awaiting Carl's OK (asked in chat)
- A dedicated station account holding the 30k KOIN, with the owner key kept offline. Tradeoff: that 30k no longer counts toward KFS voting from his main wallet (small next to his ~500k VHP).
- A station ceiling of 3,000 Mana/day (50% of the ~6,000/day refill). Estimates range from ~1,500 (Engineer) to ~2,100-2,700 (Monetization) actions/day, so testnet will settle it.
- Turn off Knode's old pool-funded sponsorOk (cap 0) **only after the station is fully launched and the apps use it** (Carl, 2026-10-19). This is a mainnet change and Carl does it himself (steps: knode_sponsor_off_steps.md).

## Team defaults (no Carl input needed)
- Pays only for allowlisted contracts and entry points; refuses token transfers and any tx over 3 Mana.
- Per-user limit: 25 actions / 50 Mana per day (the Engineer's number; supersedes Monetization's 20).
- No server, hot key, or relayer for desktop: the chain runs the station's authorize code. Monetization's server co-signature is parked as an optional phase-2 hardening step.
- KOIN Vault and mobile users get an in-browser play account that always uses the station.
- Auto-pause if the station's Mana falls below a 70% floor, plus a kill switch.
- $0 hosting (GitHub Pages, public nodes, optional Cloudflare free tier). No domain.
- The station address is labelled publicly as the sponsor for Carl's apps (honest, no anonymity games).

## Build order
1. Testnet test with throwaway keys (Engineer): measure authorize overhead and per-action Mana; confirm rejected txs cost nothing and that Kondor keeps a site-set payer; prove no key can move KOIN. **Engineer is waiting on Carl's OK in its own chat.**
2. Station contract plus caps config and auto-pauses (Engineer). Shared payer helper for Knode and SwarmTales (Engineer + Designer).
3. Knode first, then SwarmTales, on testnet, then mainnet once Carl approves funding the station account.
4. 14 days live with no critical spam = phase 1 passes (Strategist gate).
5. Phase 2 (SDK, docs, optional co-sign) after 30 days. Phase 3 (outside providers, fees) only if 3+ outside apps ask AND a lawyer approves the service-fee model.

## Deferred questions (not needed for phase 1)
Phase-2 billing (fiat via Paddle/Stripe, KOIN, or both); phase-3 listing fee and lawyer funding; the state/entity named in public terms; KFS grant for an open-source kit (Strategist).

## Reality check
Chain volume is about 200-220 tx/day and 83% is already sponsored. Mana Station is a strategic tool that makes Carl's apps free to use, not a big earner on its own.

## Carl's answers (Oct 19, 3:36 PM UTC)
- YES to a dedicated station wallet. The KOIN stays in his holdings, and KOIN whose mana is in use can't be withdrawn.
- NO fixed 3,000/day station cap. The Engineer is redesigning it as a dynamic budget: spend up to the daily refill, keep a reserve floor, and stop spam with per-user/app/rate limits. The per-tx limit is aligned with what the sponsor offers.
- YES to switching off Knode's old sponsorOk so Knode can link to the station. Kondor's built-in free mana keeps working for users; no site-offered sponsor until the station is ready. Carl signs any mainnet change. **Timing (Carl, 2026-10-19): sign `set_sponsor_limit(0)` only after the station is fully launched and Knode/SwarmTales use it.**
- NEW: the platform takes a cut of every provider/sponsor profit. Monetization is adding a take-rate model.
