#!/bin/sh
# Audit Bot attack test (testing build passes the mainnet check), mana-station commit 4343f83.
# Attack: `npm test` runs build:sim = `koinos-sdk-as-cli build-all release 1 ...`, which compiles with
# `--use BUILD_FOR_TESTING=1` (sdk-as-cli src/index.js) and writes build/release/contract.wasm, the same file
# `npm run check:mainnet` inspects and a mainnet upload would take. The check only looks for the real vUSDT/vUSDC
# strings and net.ts, which a testing build passes too.
# Asserts the SAFE behaviour: check:mainnet must REFUSE a wasm that is not the BUILD_FOR_TESTING=0 release build.
#
# audit-fixes-1 adjustments (test harness only, the assertion is unchanged):
#  - runs from this repo (was /app/contracts/station in the audit sandbox);
#  - the testing build is taken from where build:sim writes it (build/sim/ since the fix; build/release/ before) and is
#    handed to check:mainnet as the file to upload. At 4343f83 the check ignores its argument and inspects
#    build/release (the testing build) → OK → this test FAILS; with the fix it compares the file with a fresh release
#    build → refused → PASS.
set -u
cd "$(dirname "$0")/.." || exit 2
TMP=$(mktemp -d)
npm run build:sim >"$TMP/b.log" 2>&1 || { echo "ERROR: build:sim failed"; tail -5 "$TMP/b.log"; exit 2; }
SIMFILE=build/sim/contract.wasm; [ -f "$SIMFILE" ] || SIMFILE=build/release/contract.wasm
SIM=$(sha256sum "$SIMFILE" | cut -c1-64); cp "$SIMFILE" "$TMP/upload.wasm"
node scripts/check-mainnet.cjs "$TMP/upload.wasm"; rc=$?
npm run build >"$TMP/b2.log" 2>&1 || { echo "ERROR: release build failed"; exit 2; }
REL=$(sha256sum build/release/contract.wasm | cut -c1-64)
echo "build:sim (BUILD_FOR_TESTING=1) wasm sha256 $SIM"; echo "npm run build (BUILD_FOR_TESTING=0) wasm sha256 $REL"
rm -rf "$TMP"
[ "$SIM" != "$REL" ] || { echo "ERROR: the two builds are identical; nothing proven"; exit 2; }
if [ $rc -eq 0 ]; then echo "FAIL: check:mainnet accepted the BUILD_FOR_TESTING=1 wasm"; exit 1; fi
echo "PASS: check:mainnet refused the testing build"; exit 0
