# Mana Station: UX design (v0, Oct 19 2026)
Owner: Carl. Point of contact: Project Orchestrator. Follows PLAN_OUTLINE.md. **Design only. Nothing is live and nothing is spent.**
Sources: docs.koinos.io (Mana, payer/payee, resource management, local copies in koinos/raw/), engineering_feasibility_2026-10-19.md §M, ecosystem_scan_2026-10.md. Anything not backed by those is marked **VERIFY (Engineer)**.

## Facts the design rests on
- Mana comes only from liquid KOIN (VHP has none). It refills 20%/day and **can't be transferred**, so a provider's KOIN has to sit in the paying account. KOIN whose Mana has been used is locked until it refills (docs: Mana).
- With `payer` + `payee` set, the payer's Mana pays and the payee's nonce is used. **Both must authorize.** The docs advise a contract wallet whose `authorize` pays only for approved actions (docs: payer/payee).
- A contract payer's `authorize` runs inside the payer's Mana session (so it costs the payer Mana). Writes made during the check persist even if the transaction reverts, which makes on-chain rate limits possible (feasibility §M).
- Reference design already live: `@freemanasharer` (Kondor's built-in pool, cap of 100 Mana per transaction, payee required). Apps like OURO and Aurvania use a server co-signer as payer.

## 1. Provider signup (KOIN holder offers Mana, sets a small fee)
**Phase 1 (Carl only):** Carl's "station" is one sponsor contract-wallet that he controls and funds with **30,000 liquid KOIN to start** (more later, his decision Oct 19). Carl is the first user. It has no public signup, no fee, and costs $0 beyond the KOIN he already holds.
**Phase 3 flow (open network), 4 screens:**
1. **"Share your Mana"**: one line of explanation ("Your KOIN stays yours. Apps use its daily-refilling Mana to cover their users' actions."), then *Connect wallet*.
2. **Set up station**: the provider creates a station account from our open-source template. Keys never leave their wallet. They move in however much KOIN they choose. A live gauge shows "≈ X sponsored actions/day" (KOIN × 0.20 ÷ Mana per action).
3. **Set limits and fee** (sensible defaults pre-filled): daily Mana budget (default 50% of the refill, so the station never empties and the provider's KOIN is never fully locked), which apps to serve (*any listed app* or *only apps I approve*), and a fee as a **flat monthly plan per app** with an optional **capped per-1,000 overage** (examples from Monetization: free / $5 / $25 monthly, plus ~$0.50 per 1k overage with a hard cap). No prepaid transferable credits. Shown in plain dollars with a KOIN equivalent. Fee is only valid if KOIN stays in the provider's account, pricing is never a % of KOIN held, each provider runs its own station, there is no pooling, and no yield wording (Monetization §3).
4. **Review and go**: a plain summary that also states the risks: "Your KOIN stays in your station. Used Mana makes an equal amount temporarily non-transferable; it unlocks gradually (at most 5 days, usually much sooner). This is a service fee setup, not interest or yield. Withdraw unlocked KOIN anytime; pause to let the rest unlock." One *Pause station* button is always visible.
Dashboard: Mana left today, actions sponsored, apps served, fee earned, plus *Pause*, *Withdraw* and *Edit limits*.
- **VERIFY (Engineer):** can a normal wallet install the template `authorize` override on itself, or does each provider need a separate contract-account? How do fees get collected without us ever holding provider funds?

## 2. Developer onboarding (pick a provider as payer in a few steps)
1. **Register app**: app name, contract address(es) and the **entry points to sponsor** (an allowlist; nothing else gets paid for).
2. **Pick a station**: Phase 1 is fixed to Carl's station. Phase 3 lists stations with capacity, fee and uptime, or offers *auto-match* to the cheapest one with room.
3. **Set per-user limits**: actions/user/day, max Mana per transaction (default 100, matching freemanasharer), and a daily app ceiling.
4. **Drop in the helper**: `npm i` the small JS helper (Phase 2) and one call, `sponsor(tx)`, which fills `payer` = station and `payee` = user, then returns the transaction for the user to sign. There's a copy-paste sample for koilib.
5. **Test button**: sends one sponsored test call on testnet and shows a green check with the Mana used.
- **Knode first:** the site has to set `payer` itself. Today it never does, and its built-in `sponsorOk` is capped at 2 KOIN of RC, so Carl's station should replace it. **VERIFY:** do Knode and SwarmTales share wiring (PLAN Q5)?
- **VERIFY:** can one contract payer cover arbitrary users' calls into *other* contracts (Carl's apps), or only calls into itself (PLAN Q2)? Docs suggest yes via `authorize` checking operations. Confirm on testnet.

## 3. End-user flow ("play with zero KOIN", sponsorship invisible)
**Desktop / any wallet that signs a transaction with a payer already set:** user taps *Play*, the app builds the transaction with payer = station and the user's wallet asks to sign "Play move" (no fee line), then it's done. Users never see Mana. A small footer / about link uses Monetization's disclosure: "Free to use: network costs (Mana) are covered by [App]'s sponsor, Mana Station account `[address]`. You sign every action; the sponsor can't access your account or assets. Sponsorship may be limited or end. You can always use your own Mana."
**Mobile / KOIN Vault gap** (it can't set a payer and rejects low-Mana requests over the ~100 Mana dApp ceiling). Ordered fallbacks:
1. **Play account (default for new mobile users):** the app makes a lightweight in-browser key on first tap, the pattern OURO and Aurvania use. Play starts instantly with no wallet, and the app co-signs with the station as payer. The user can save progress with email or a passkey later.
2. **Link your wallet later:** when something is worth owning (a badge or item), a *Move to my wallet* step sends it to their Vault or Kondor address. That one action is sponsored too.
3. **Relayer / server submit:** the app submits on the user's behalf for actions tied to their play account. **VERIFY:** whether Vault can sign a payload or message that a relayer can wrap, and relayer vs. waiting for a Vault update (PLAN Q3).
4. **Desktop Kondor users** who already have the free-Mana option keep using it. We don't fight it.
Honesty rule: the play-account key belongs to the user (exportable). We never claim it's "your wallet" if we hold the key server-side.

### Mana preference (users who already have Mana)
**Default (changed by Carl, Oct 19 4:05 PM):** the user's own Mana when they have enough. If the wallet has too little Mana, the app uses the station as payer, with no prompt, no toggle and no mention of Mana.
**Users with their own Mana** can choose to spend theirs instead. Detection: before building the transaction, the app reads the wallet's Mana. If it's above a small threshold (VERIFY: e.g. enough for one typical action), show a quiet preference once, then remember it.
**Where it lives:** under *Settings → Play costs* (or *Account → Advanced*), never on the main play path. One line of copy and a two-option control:
- **Use my Mana when I have enough** — the app falls back to free play when you run low. *(default)*
- **Always use free play** — the app covers this action.
**(The one-time "use your own Mana?" tip below is no longer needed, because own Mana is now the default.)** **Wording rules:** never say "gas," "fee," or "blockchain" on this screen. First time a Mana-holding user plays, a one-time soft tip may appear after a successful action: "You have Mana in your wallet. Prefer to use it? Change anytime in Settings." Dismissible, never blocks play.
**Opt-out of the tip forever:** the tip has *Not now* and *Don't ask again*. Choosing *Use my own Mana* in Settings turns the tip off.
**Play-account / Vault users:** no toggle. They always use the station (they can't set a payer and usually have no Mana). Invisible.
**Desktop Kondor free-Mana users:** if they already use Kondor's free pool, leave them alone; don't offer the station unless their free pool fails.

### When the station runs dry (Monetization)
Server checks available Mana **before** the user signs. Never let them sign into a doomed transaction.
**Fallback order:** backup station → user's own Mana → Kondor's free-Mana option (user's choice) → queue and auto-retry.
**Copy (honest):** "Free actions are paused for a bit: our sponsor's daily allowance ran out. Try again in about [ETA], or continue now with your own Mana." Never say "network error" or "unlimited."
ETA ≈ Mana needed ÷ (0.2 × station balance per day). Free = best effort; paid plans get a credit if availability drops (Monetization).

## Abuse controls (brief; protects Carl's KOIN without blocking first play)
- **On-chain, in the station's `authorize`:** allowlisted contract + entry point only, a per-transaction Mana cap, a per-payee daily count (stored during authorize, so it persists through reverts), a station-wide daily ceiling, and an owner kill-switch. **No KOIN transfers are ever authorized.**
- **First play is never gated:** each new play account gets a small free starter budget (e.g., 20 actions/day) with no captcha and no sign-in.
- **Gradual friction only past that:** invisible checks first (device/IP rate on the app server), then a one-tap captcha, then *save with email* to raise limits. Accounts that break the limits are throttled, not banned.
- **VERIFY (critical):** authorize compute is billed to the payer, so do *rejected* spam transactions still burn the station's Mana? If so, the app server must pre-filter before anything reaches the chain. Also measure the exact Mana cost of one authorize call on testnet.

## Open items
**VERIFY (Engineer):** wallet-vs-contract station setup, cross-contract payer (Q2), Vault signing and relayer (Q3), Knode/SwarmTales wiring (Q5), rejected-tx Mana cost, authorize Mana cost, non-custodial fee collection.
**Monetization (answered Oct 19, see monetization_legal.md §5):** Fee is a plain service fee if conditions hold. Pricing = monthly plan + capped per-1k overage (no transferable credits). Station-dry fallback and copy captured above. KOIN lock is partial/gradual (corrected). End-user disclosure captured in §3.
**Carl (decided Oct 19, via Orchestrator):** Phase-1 station starts with **30,000 liquid KOIN**, more later. Carl is first user. Apps use the user's own Mana by default when they have enough; the station covers users without enough Mana or who choose free play (changed Oct 19 4:05 PM; see Mana preference above).
