# Mana Station testnet kit (Harbinger only)
- `keys.testnet.json`: throwaway keys generated 2026-10-19 (mode 600). Testnet only, never mainnet, never real KOIN.
- `genkeys.mjs`: generates them (refuses to overwrite).
- `run_tests.mjs`: deploy + measurement script. **Not run yet.** On 2026-10-19 the Harbinger RPC was down (harbinger-api.koinos.io: TLS EOF from the box, 504 Gateway Timeout from an outside fetcher). The only documented faucet is a Discord bot (`!faucet <address>` in #faucet), which needs a human Discord login.
- To run later: `RPC=<harbinger url> KOIN_ADDR=<harbinger KOIN id> node run_tests.mjs balance` (read-only), then `... all`. Sized for the 50 tKOIN Carl sent to `funder` (test-only floor 3 Mana; mainnet stays 6,000). Results go to `results.json`.
- NOTE (4:25 PM): `run_tests.mjs` targets the v1 ABI (init/set_app fields). Update it to the v2 config before any testnet run.
