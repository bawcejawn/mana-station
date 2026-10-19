# Mana Station testnet kit (Harbinger only)
- `keys.testnet.json`: throwaway keys generated 2026-10-19 (mode 600). Testnet only, never mainnet, never real KOIN.
- `genkeys.mjs`: generates them (refuses to overwrite).
- `run_tests.mjs`: deploy + measurement script. **Not run yet.** On 2026-10-19 the Harbinger RPC was down (harbinger-api.koinos.io: TLS EOF from the box, 504 Gateway Timeout from an outside fetcher). The only documented faucet is a Discord bot (`!faucet <address>` in #faucet), which needs a human Discord login.
- To run later: `RPC=<harbinger url> KOIN_ADDR=<harbinger KOIN id> node run_tests.mjs balance` (read-only), then `... all`. Sized for the 50 tKOIN Carl sent to `funder` (test-only floor 3 Mana; mainnet stays 6,000). Results go to `results.json`.
- NOTE (4:25 PM): `run_tests.mjs` targets the v1 ABI (init/set_app fields). Update it to the v2 config before any testnet run.

> 2026-10-19 19:50 UTC: still blocked (Harbinger TLS cut by the box egress proxy). run_tests.mjs targets the v1 ABI; update it to the v2+escrow ABI (abi/station.koilib.json, 30 methods) once Harbinger is reachable.

## v2 (2026-10-19 21:00 UTC): runs on GitHub Actions (private repo bawcejawn/mana-station, manual `testnet` workflow)
- The box cannot reach Harbinger, so `.github/workflows/testnet.yml` runs: unit tests → testnet build (`npm run build:testnet`, VUSDT = the worthless mock token `contracts/mocktoken`) → mainnet build + `check:mainnet` → `run_tests.mjs` against https://harbinger-api.koinos.io.
- Keys: the whole `keys.testnet.json` is the Actions secret `TESTNET_KEYS` (never committed; masked; deleted at the end of the job). Roles added: token, buyer, spam1, spam2 (`genkeys.mjs` only adds missing roles).
- `run_tests.mjs` (v2): funding, deploys paid by the funder, provisional config, Mana measurements (self vs sponsored, Kondor 1.1x), Stories app spam (rate limit, new-user pool, buffer), designated-apps-only refusals, escrow allowance (reservation refusal, suspend, cancel refund), tickets (big tx buffer, 5% fee, anti-spam), invariants. Results: job summary + `results.json` / `results.md` artifact.
