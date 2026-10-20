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

### Status 2026-10-19 21:05 UTC (run https://github.com/bawcejawn/mana-station/actions/runs/39324313152)
- PASS on GitHub Actions: install, unit tests (MockVM 43/43), testnet build with the mock stablecoin, mainnet rebuild + `check:mainnet` (real vUSDT/vUSDC, no mock), testapp + mock token builds.
- BLOCKED: the Harbinger scenarios step failed at its first call: `connect ETIMEDOUT 45.79.244.237:443` (harbinger-api.koinos.io) from GitHub's runner; an independent fetcher gets 504 Gateway Timeout. Harbinger's public RPC is down, not only the box's egress. No tx was sent, so no tKOIN was spent and no testnet scenario ran; no costs were measured.
- Next: when harbinger-api.koinos.io answers again (`curl -d '{"jsonrpc":"2.0","id":0,"method":"chain.get_chain_id","params":{}}' https://harbinger-api.koinos.io`), rerun: `gh workflow run testnet.yml -R bawcejawn/mana-station -f run_testnet=true`. Alternative endpoint: an API-key Harbinger provider (e.g. api.harbinger.koinos.pro, needs Carl's free API key as a secret and a small `RPC` change; the script refuses non-"harbinger" URLs and mainnet's chain id).
- run_tests.mjs v2 has not executed against a live chain yet: expect a first-run fix or two (koilib option details, tx-size limits, real Mana costs).

### Status 2026-10-20 03:55 UTC (branch fix/squat-freeze-stall, runs 39366080825 and 39366513329)
- PASS on GitHub Actions: install, unit tests (58/58), testnet build with the mock stablecoin, mainnet build + `check:mainnet`, testapp + mock token builds.
- BLOCKED again at the first RPC call: `connect ETIMEDOUT 45.79.244.237:443` (harbinger-api.koinos.io). No tx was sent, and no tKOIN was spent.
- Fix ready: the workflow now reads the RPC from the Actions secret `HARBINGER_RPC` when it is set, falling back to the public endpoint. Set it to `https://api.harbinger.koinos.pro/jsonrpc?apikey=<free Koinos Pro key>` (docs.koinos.io/developers/testnet), then rerun the workflow on the branch. The script masks the key in its output.
- The workflow now also posts the results and the script's last 60 lines as annotations, so failures are readable through the API.
