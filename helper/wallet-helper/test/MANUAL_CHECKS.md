# Helper: manual checks

Automated checks run offline: `node --test helper/wallet-helper/test/*.test.mjs`, then
`node helper/wallet-helper/build.mjs testnet` and the two Chromium scripts (`test_helper.py`,
`chromium_secret_check.py`). The build's final zip step needs `zip`; the dist files are written before it.

The check below uses the real unpacked extension and a real wallet, so run it by hand before each store upload.

## AB-038: no site can read the per-load secret (Audit Bot fix check, 2026-10-22)

The automated `chromium_secret_check.py` runs page.js with a stand-in bridge. This check runs it with the real
extension, including bridge.js in the extension's own world.

1. Build the testnet helper (`node helper/wallet-helper/build.mjs testnet`) and load `helper/wallet-helper/dist/testnet`
   unpacked in Chromium or Chrome (Extensions, Developer mode, Load unpacked). Have Kondor installed, on testnet.
2. Serve a test page on `http://localhost` (for example `python -m http.server` in an empty folder). Its first script:
   ```html
   <script>
     Object.defineProperty(Object.prototype, "then", { configurable: true,
       get() { console.log("then getter, event:", window.event && window.event.type); return undefined; } });
   </script>
   ```
   Then load koilib and kondor-js and have a button that asks Kondor to sign a small testnet transaction for your wallet.
3. Open the console and press the button.
4. **Expected:** no line shows `event: ms-answer-…` or `event: ms-ask-…`. Lines with `event: undefined`, or with the
   page's own click event, are fine. Before the AB-038 fix (helper 0.3.1) the line `event: ms-answer-<secret>` appeared.
5. Approve or reject in Kondor. If the station would pay, the transaction shows the station as payer.
