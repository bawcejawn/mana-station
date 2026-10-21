# Helper audit, 2026-10-21

Independent review (separate agent, no part in writing the code) of the helper extension before store submission.
No critical findings: a website can't use the helper to move funds, reach keys or sign anything without the user's
approval in the wallet; the only network call is the read-only `would_pay` on the configured station and node.

| # | Finding | Status |
|---|---|---|
| H1 | Passes are charged by a transaction's Mana *limit*; the helper raised missing limits to the 2 Mana maximum, so one action could use 2 Mana of a pass | **Fixed.** The helper asks with the site's limit only if it's a sensible size (0.01 to 0.5 Mana), else 0.5 Mana; never a limit worked out from the user's balance. Kondor's "optimize mana" then sets ~1.1x real use. Counting by limit is now stated in the terms. |
| M1 | A wallet with 0 Mana had its limit carried over as 0; uploads capped at the station maximum would fail | **Fixed.** 0 or oversized limits are replaced by the default; uploads are left alone (they use tickets on the site). |
| M2 | A page could make the background run a 90 s decode or a huge allocation, or flood the node | **Fixed.** Strict checks (addresses, entry points, base64url args up to 64 KiB, 1 to 10 call operations, limit up to the maximum), address length cap in the encoder, one question at a time and 20 a minute per tab. |
| M3 | Ran on every kind of page; told every site the user has the helper; disclosures | **Fixed:** https and localhost only (plus local files in the testnet build); the "helper is on" marker only on the Mana Station site; privacy notice and store disclosures updated. **Deferred:** asking per site (optional host permissions), which adds friction. |
| L1 | A page can forge answers / inflate the counter | **Fixed:** answers must carry a plain number; the count comes only from the station's yes answers in the background. |
| L2 | Checks and the forwarded copy could differ (getters), built-ins replaceable | **Fixed:** built-ins saved before site code runs; one private copy is checked and forwarded. Tested with a getter that swaps operations. |
| L3 | Wrapper differences from native postMessage | **Fixed:** requests it won't change go through at once, unchanged; `this` respected; errors reported back to the caller. |
| L4 | Switched off wasn't fully off | **Fixed:** the page part learns the setting and asks nothing while off. |
| L5 | Payer choices made elsewhere could be overridden | **Fixed** for send options (payer/payee/limit set by the site: left alone). Kondor's own "free mana" box is the user's choice in Kondor's window and still wins. |
| Q | Can someone spend another wallet's pass by naming it as payee? | **No.** Tested on the live testnet: the chain refuses ("account … has not authorized transaction") without the payee's signature. |
| Info | Encoder correct; edge cases | Negative values and bad entry points refused; base64url only; leftover file removed. |

Open, by design: Kondor's window is where the user sees the payer (under Advanced); a short in-page notice before
Kondor opens is a possible later addition.

Tests: `test/test_helper.py` (18/18, page part), `test/test_background.mjs` (19/19, background and encoder),
`test/live_test.py` (real unpacked extension on the Koinos testnet: station pays with the helper on, not with it off).
