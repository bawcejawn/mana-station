# Mana Station: first plan outline (v0, Oct 19 2026)
Owner: Carl. Point of contact: Project Orchestrator. Other open ideas are PARKED (launch engine, P001/I035/P003/P004) until Carl returns to them.

## Goal
A reusable mana-sponsorship service: providers (Carl first, later other KOIN holders) supply mana; apps (Knode, SwarmTales, others) use a provider as payer so their users transact without needing their own mana.

## Known facts (from Carl via Clover)
- Kondor desktop's free-mana checkbox works for normal (non-contract) wallets; it's not the default.
- KOIN Vault (phone) can't set a custom payer and refuses low-mana answers (dApp ceiling about 100 mana).
- The Knode site never sets payer=contract. The Knode contract has sponsorOk, but the site doesn't use it and it's capped at 2 KOIN of RC.
- Using the Desk contract address as a player wallet fails (desk authorize returns false for outside token moves). This is not a Kondor ban.
- Carl needs anti-spam protection if he funds sponsorship himself.
- Background: mana comes only from liquid KOIN (VHP carries none) and regenerates about 20%/day. Kondor already has a free shared-mana contract (prior research).

## Phases
1. Carl's personal provider: one sponsor contract or wallet that pays for Carl's own apps, with an allowlist of contracts and entry points, per-user and per-day rate limits, and a hard mana ceiling. Wire Knode's site to set payer properly. $0 beyond existing KOIN.
2. Developer integration kit: a small JS helper and docs so any app can request sponsorship, with a fallback when the wallet (e.g. KOIN Vault) can't set a payer (relayer or server-side submit).
3. Open provider network: a registry where holders opt in as providers. Apps pick or are matched to a provider, with a small adjustable fee (subscription or per-use). Non-custodial: providers never hand over keys or KOIN.

## Workstreams
- Engineer: payer/authorize mechanics, a sponsor contract design (allowlist, rate limits, caps), a mobile-wallet workaround, the Knode wiring fix, and a provider registry design.
- Designer: provider signup flow, developer onboarding, and an end-user flow that's invisible to the user.
- Monetization/Legal: fee model, anti-spam economics, a legal read (non-custodial, no yield promises, no lending framing), and terms.
- Strategist: competitive check (the Kondor free-mana contract and others), positioning, and the phase-gate criteria.

## Open questions (for the team first; Carl only if needed)
1. How much liquid KOIN is Carl willing to dedicate as phase-1 sponsor mana? (Carl decision, later)
2. Can a contract act as payer for arbitrary users' transactions, or only for calls into itself? (Engineer)
3. Mobile workaround: relayer vs. waiting on a KOIN Vault update? (Engineer)
4. Is a "provider charges a fee for mana" model legally just a service fee? (Monetization)
5. Do SwarmTales and Knode share a codebase or need separate wiring? (Engineer)
