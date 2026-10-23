# Mana Station: scope for an independent audit

Version under review: branch `audit-fixes-1`, the commit that adds this file (tag `audit-2026-10`). The findings of
that audit are fixed or accepted on branch `audit-2026-10-fixes` (accepted items: `docs/LAUNCH.md` section 8); the
facts below are updated to that branch. Nothing is deployed on Koinos mainnet yet.

## What Mana Station is

Mana Station is a Koinos smart contract (AssemblyScript) that pays other people's Mana. It overrides the chain's
`authorize` for transaction application, so a transaction that names the Station as payer is paid only if the Station's
rules say yes. It also overrides contract calls (so its own key can't move its tokens) and contract upload (so only
council-approved code can replace it). What it pays for is sold in three forms: **Mana passes** (daily Mana for one
wallet's own transactions), **app plans** (daily Mana for every user of one app contract) and **big-upload tickets**
(Mana reserved for one large transaction or contract upload). A few free apps chosen by the owner are also paid for.

Buyers pay in a stablecoin (vUSDT or vUSDC). Payments are held in escrow inside the contract and released to the
treasury as each term ends; cancels, owner refunds and suspensions refund the unused share by fixed rules. Day-to-day
settings belong to an **owner**. Anything that moves money out of escrow or the Station's KOIN, changes the code, the
council, the owner, the treasury or the waiting period goes through a **council** (2 of 3; 3 to 7 members allowed, threshold below the
size; a 48-hour public wait, vetoes). The site, a browser extension and admin scripts sit around the contract.

## Map of the repository

| Path | What it holds |
|---|---|
| `contracts/station/` | The Station contract (`assembly/Station.ts`, `assembly/proto/station.proto`), its unit and attack tests (`assembly/__tests__/`), build scripts (`scripts/`, incl. `check-mainnet.cjs`), the proposed mainnet settings (`config/mainnet.proposed.json`) and generated ABIs (`abi/`). |
| `contracts/testapp/`, `contracts/mocktoken/` | A demo app and a mock stablecoin, testnet only. Their `node_modules` are committed symlinks to `../station/node_modules`. |
| `helper/wallet-helper/` | The browser extension ("helper"): sets the Station as payer on a site's Kondor signing request when the Station would pay. `src/` (page.js in the page's world, bridge.js in the extension's world, background.js), `build.mjs`, tests in `test/` (node, Chromium, a manual check). |
| `site/` | The website: built pages (`*.html`), their sources (`src/`), wallet code (`wallets.js`, `ms.js`), generated data (`abis.js`, `playground.js`) and tools (`tools/`: page build, CSP-hash test, helper-page test, publish script). |
| `admin/` | Owner and council tools with no npm packages (koilib loaded from its pinned, SRI-checked bundle): `station-admin.mjs` (owner / council actions, each shown in full and confirmed before signing), `deploy-station.mjs` (deploy + init in one transaction, read back), `preflight-mainnet.mjs` (read-only mainnet checks), `measure.mjs` (costs on a node). Keys from `ADMIN_WIF` or a hidden prompt; each tool is pinned to one network. |
| `testnet/` | Testnet playground and scenario scripts (`playground.mjs`, `run_tests.mjs`, `genkeys.mjs`), `playground.json` (public testnet addresses) and its README. Keys file `keys.testnet.json` is git-ignored. |
| `.github/workflows/testnet.yml` | The only CI workflow: manual; unit tests, testnet and mainnet builds, `check:mainnet`, optional testnet runs with throwaway keys from a repository secret. |
| `docs/LAUNCH.md` | Who can do what, launch checklist, release sha256, known limits. |
| Top-level `*.md` | Design and planning notes (design, engineering, strategy, monetization, stablecoins, build plan). Background, not specification; `docs/LAUNCH.md` and the code are authoritative. |

## Scope

The whole repository at this commit. Most security-sensitive, in order:

1. The Station's `authorize` (`sponsorOk` / `decide` and the routes below it). It is the whole boundary of what the
   Station pays for: free checkout, operator admin, big-upload tickets, free apps, app plans, Mana passes.
2. Escrow and refunds: purchases, renewals, cancels (including the charge for Mana used), releases, owner refunds,
   suspensions, pause credit, the slot fee.
3. Owner and council powers: limits locked at purchase, the council timelock and vetoes, upgrades through
   `authorize(contract_upload)`, `init` only inside the upload transaction.
4. The extension (`helper/wallet-helper/`), especially the page script that runs in every site's world.
5. The site's wallet handling (`site/wallets.js`, `site/ms.js`, the pages' inline scripts and CSP).
6. The admin and testnet scripts (key handling), and CI (`.github/workflows/testnet.yml`).

## Top priority for the auditor

These have so far only been tested in MockVM, never on a real chain:

- **(a)** Whether state written inside `authorize` (usage counters, a user's cooldown, ticket balances) persists when the
  paid transaction then reverts. Related note: `testnet/README.md` records that the testnet node rejected a reverting
  sponsored call at submission.
- **(b)** Whether a wallet's default authority applies inside a nested contract call. The `direct()` caller checks
  (buyer, payer, target, payee, owner, council) depend on it.
- **(c)** `get_contract_metadata` for the "is this a deployed contract" check that guards the reserved app slots.
- **(d)** The real compute cost of `buy_allowance` and of the heaviest `authorize` route at `open_cap` 50, against
  mainnet resource limits. MockVM system-call counts are in `docs/LAUNCH.md`.

## How to build and test (from a fresh clone)

Verified for `audit-fixes-1` on 2026-10-23 from a fresh clone on Windows with Node v24.22.0 and npm 11.19.1. CI uses Node 20 on Ubuntu.

```sh
git clone -b audit-2026-10-fixes https://github.com/bawcejawn/mana-station.git && cd mana-station

# Station contract: unit and attack tests (265), release build, mainnet check
cd contracts/station
npm ci
npm test                      # builds the test build (build/sim/) and runs as-pect: 265 tests, 5 skipped
npm run build                 # release build: build/release/contract.wasm
npm run check:mainnet         # refuses anything that isn't a fresh release build
sha256sum build/release/contract.wasm
#   expected: 0c37a13f80f5f852659c8518d21cf3152d32d5d7e973dbf83734e0183dc9ca61  (108,104 bytes)
#   (the audited tag audit-2026-10 built 7e0002878967440091faed76b3e31f7a3e75d15ba9d279b19a7481c315d4f855, 101,009 bytes)
sh scripts/check-mainnet.audit-testingbuild.test.sh   # AB-007: a testing build must be refused
cd ../..

# Demo app and mock token (testnet only). On Windows, the committed node_modules symlinks check out as plain files:
# replace each with a link to ../station/node_modules first (Linux and macOS need nothing).
(cd contracts/testapp && npm run build) && (cd contracts/mocktoken && npm run build)

# Extension (testnet build; a mainnet build needs the deployed Station address)
node helper/wallet-helper/build.mjs testnet           # output in helper/wallet-helper/dist/testnet/ (the last step zips it: needs `zip`)
for f in helper/wallet-helper/test/*.mjs; do node --test "$f"; done
pip install playwright && python -m playwright install chromium
python helper/wallet-helper/test/test_helper.py
python helper/wallet-helper/test/chromium_secret_check.py

# Site
node site/tools/make-site-data.mjs                    # site/abis.js from the release ABI (run after npm run build)
node site/tools/build-pages.mjs                       # site/*.html from site/src/
node --test site/tools/csp-hashes.test.mjs site/tools/helper-html.rt-web-standin.test.mjs
```

On Windows the shell test needs LF line endings (`tr -d '\r'` into a copy next to the original). The ABI generator in
`npm test` / `npm run build` downloads a few helper packages the first time it runs, and occasionally fails to read its
input pipe (EAGAIN); CI retries it.

**Results on `audit-2026-10-fixes`:** contract 265 passed, 5 skipped (the proofs of accepted items below); helper node
tests 46 passed; Chromium 19/19 and 3/3; site 11 + 3 passed; AB-007 script passed. Rebuilt site pages are byte-identical to the
committed ones. The release sha256 above is the same built on Windows and on Linux.

**Toolchain (pinned in `contracts/station/package-lock.json`):** AssemblyScript 0.27.37, @koinos/sdk-as 1.5.1,
@koinos/sdk-as-cli 1.0.2, @koinos/mock-vm 1.3.0, @as-pect/cli 8.1.0, koilib 9.4.1, protoc 36.2, pinned by version and per-platform sha256 (`contracts/station/scripts/protoc-pin.cjs`, run by the
prebuild step: a download with another checksum is refused).
Chromium checks: Python with Playwright (verified with Playwright 1.64.1, Chromium 156).

Not run for this scope: `helper/wallet-helper/test/live_test.py` and the scripts in `testnet/`, which send real testnet
transactions.

## Deployments

- **Testnet** (Koinos testnet, `testnet/playground.json`): Station `17cDBCCPLNtgAULweeiLeViBRKnaZFDGps` (playground v4,
  the audit-2026-10 fixes), demo app `1Ehbp3bP8qv43bbwuSgHoLmW7NrdS6V6wU`, open app `1Vi2rdbDVQsog192TqzcVTunJkHbPGmNw`,
  mock stablecoin `1YWtATASNeTD7hoimcfxg13W1TCvhfESa`, testnet KOIN `1FaSvLjQJsCJKq5ybmGsMMQs8RQYyVv8ju`, owner
  `1GcusCGwkbQWoRm4Vbwc8eLxNj8dCdKujf`, council `1C5WCih2qyccDKzqMRAGbDP9x9LHL7Sqwb`,
  `1F7FqZ8jLhpwSAaYsmjbpL2DwvutGPDCx9`, `1nKNbSUmGQacouNmm4crc9aR1Td8jALyU`, funder
  `1B2fSvQjBMJWcekYsd8chTCf21dc58k64B` (testnet keys rotated on 2026-10-23 after O1-01; the audited tag used playground
  v3 `1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc` and funder `1N6yd5SzAQaHe484vkV7pFhmYiGfQh2Cuy`, both retired).
- **Mainnet:** not deployed. `1Mpmf2ERhjYpX7CCiM11WERuM4j17uT1sr` in the docs is Knode (Kpred), an existing mainnet
  game the Station would sponsor as a free app, not part of this repo.
- **`contracts/station/config/mainnet.proposed.json`** is a proposal, not a deployed configuration. Placeholders: the
  owner (`<Carl's offline owner wallet>`), the three council wallets (given at launch, not in the file), the treasury
  (empty = the owner wallet unless set), and the Stories app's contract id (`<Stories contract id, not deployed yet>`).

## Keys and roles

No key material is in the repository or its history.

| Role | What it can do | Where its key is meant to live |
|---|---|---|
| Owner | Day-to-day settings within contract bounds (limits, prices, free apps), suspend buyers, owner refunds, resume after a pause. Never a council member. | An offline wallet; used through `admin/station-admin.mjs` or the owner page. |
| Council (3 members, 2 needed) | Propose, approve and veto guarded actions: upgrade, KOIN withdrawal, token rescue, council, owner, treasury, waiting period, higher ticket fee, settling a purchase frozen by sanctions; any one member can pause. | Three plain wallets (not contract accounts) on three separate devices, ideally three people. |
| Treasury | Receives released escrow. No powers. | Any external wallet (default: the owner wallet). |
| Operators | Owner and council: their transactions to the Station may be paid by it, under the same per-user limits. | As above. |
| The Station's own contract key | Nothing on its own: it can't move the Station's tokens, replace its code, or re-run `init`. Needed once, to upload and init in one transaction. | Offline; not needed after deployment. |
| Testnet keys | Testnet funder, mock token and derived playground keys; testnet only. | Repository secret `TESTNET_KEYS` (CI) or the git-ignored `testnet/keys.testnet.json`; derived keys are masked in CI logs. |

## Design decisions and accepted items

The items accepted after the audit-2026-10 report, with reasons, are in `docs/LAUNCH.md` section 8. Earlier ones:

- **Slot squat (AB-023), accepted:** holding all 50 open slots costs about 50 × the $0.02-a-day slot fee (about $1 a
  day). Renewals and existing customers are never blocked; the response is the daily 80% alert.
- **Suspension refunds (AB-030), by design:** a suspension for abuse, AUP or legal reasons refunds more than the buyer's
  own cancel would (no 1-day charge or minimum kept).
- **Limits locked at purchase:** a paid term keeps the limits it was sold with; while it runs, the more generous of the
  stored and the current value applies. Free use follows the current settings; pause still stops everything.
- **Vetoes:** a veto blocks the same kind of action for 14 days (any target, any contents); each member sets at most one
  block per kind per 30 days (later vetoes still cancel their proposal); a council change that removes the vetoer or
  the vetoed proposal's proposer is never blocked; proposals that had all their approvals before the veto continue.
- **`open_cap` must stay below 64** until renewals are reconsidered (above it, renewals alone can fill the 512 open
  purchases).
- **Extension, real-browser check is manual:** `helper/wallet-helper/test/MANUAL_CHECKS.md` (with the real extension and
  Kondor); the automated Chromium check uses a stand-in bridge.
- **Test hygiene:** a few refusal checks in `Station.fc-AB011-veto.spec.ts` and `Station.v-AB005-relayed-payee.spec.ts`
  still assert only that something reverted, not the contract's reason.
- **Old veto records:** storage space 21 (veto records written by earlier versions) is not read by this version, so a
  veto active at upgrade time stops counting after the upgrade.

## Previous review

Internal, automated security audits were run on earlier commits of this branch. Their attack tests are kept in the
repository (`contracts/station/assembly/__tests__/Station.audit-*`, `*.rt-*`, `*.fc-*`, `*.fc2-*`, `*.rt3-*`, `*.v-*`,
`*.verify-*`, and the `audit` / `rt-web` / `fc` tests in `helper/wallet-helper/test/` and `site/tools/`). Code comments
refer to their finding IDs (AB-nnn). Please review independently.

## Reporting findings

Privately to the owner, not in public issues. Please include the commit, the file and line, and a local test or a
described transaction sequence. Don't test against mainnet.
