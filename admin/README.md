# admin/: the owner and council tools

Tools that sign with the owner's, a council member's or the Station's own key. They use **no npm packages**
(audit-2026-10 M-13): `lib.mjs` loads the pinned koilib 9.4.1 bundle (the same file the website loads), checked against
its sha384 before it runs, from `admin/vendor/` (downloaded once, not committed). Every tool needs `NETWORK=mainnet` or
`NETWORK=testnet` and refuses a node on another chain (O1-05). Keys come from a hidden prompt or `ADMIN_WIF`, never a file.

| Tool | What it does | Key |
|---|---|---|
| `station-admin.mjs` | Owner and council actions; every proposal, approval, veto and execution is shown in full and confirmed by typing a word | owner or council member |
| `deploy-station.mjs` | The mainnet deploy: checks the wasm against the published sha256 and the settings file, uploads and inits in one transaction, then reads back code hash, permissions and settings (M-12). `--dry-run` first | the Station's own key |
| `preflight-mainnet.mjs` | Read-only mainnet checks: get_contract_metadata, vUSDT/vUSDC decimals and powers, resource prices (C3, D5, M-5, O1-09) | none |
| `measure.mjs` | Testnet / local node: real cost of buy_allowance and authorize up to 50 open allowances, to set hard_max (M-8) | testnet funder |

Run them from a machine that doesn't have the contract's development install, or at least never run `npm install`
without `--ignore-scripts` there. Better still, sign owner and council actions with hardware wallets when Koinos
supports them.
