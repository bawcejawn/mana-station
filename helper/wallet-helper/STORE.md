# Store listing: Mana Station helper

## Where it's published (one package, $0)
- **Chrome Web Store** (one-time $5 developer fee): Chrome, **Brave**, Opera, Vivaldi and other Chrome-based browsers
  install from here.
- **Microsoft Edge Add-ons** (free): Edge on computers. Edge for Android only offers a short list Microsoft picks.
- **Phones:** Chrome and Safari on phones can't add extensions (Safari would need a paid Apple developer account and an
  App Store app). On phones the station reaches users through the apps instead: apps that add the station check
  (`helper/payer.js` → `sendWithStation`) cover pass holders and their own users in any browser, with nothing to install.
- Firefox (desktop and Android) could take the same code with small changes, once a Koinos wallet is available there.

Everything the Edge Add-ons and Chrome Web Store forms ask for. Upload `dist/mana-station-helper-mainnet-<version>.zip`
(built with `node helper/wallet-helper/build.mjs mainnet <station> <hard_max> <site url>`) once the station is on mainnet.

## Name
Mana Station helper

## Short description (≤132 characters)
Lets your Mana Station pass, and apps the station supports, pay your Koinos transaction fees. No keys, signs nothing.

## Full description
Koinos transactions cost Mana. Mana Station pays that cost for wallets with a Mana pass and for apps that the station
supports. This free helper makes it automatic.

When a Koinos site asks your wallet (such as Kondor) to sign a transaction, the helper first asks the Mana Station
"would you pay for this?". If the answer is yes, it sets the station as the payer before your wallet opens. Your
wallet shows the transaction as usual and you approve it. If the answer is no, nothing changes and your own Mana pays.

- Holds no keys and can't sign anything.
- Never changes what a transaction does (contracts, amounts, operations), only who pays the Mana.
- Leaves alone transactions that another sponsor already pays for.
- Switch it on or off from its button in the toolbar.
- Open source.

## Category
Productivity (Chrome) / Productivity (Edge)

## Single purpose (Chrome)
Set the Mana Station as the fee payer of Koinos transactions it will pay for, before the user's wallet asks them to approve.

## Permission justifications
- **Content scripts on web pages (`https://*/*`, plus localhost for developers):** Koinos apps can be on any website. The helper must see a site's signing request to the wallet on whichever Koinos site the user visits. It acts only on Koinos wallet signing requests and passes everything else straight through, unchanged.
- **`storage`:** keeps the on/off setting and today's count of covered transactions, in the browser only.
- **Host permission for the Koinos node (`https://api.koinos.io/*`):** to ask the Mana Station contract the read-only question "would you pay for this transaction?".
- **Remote code:** none. All code ships in the package.

## Data use disclosures
- Declare: **Financial and payment information** (the wallet address and the transaction about to be signed) and **Website content** (the transaction's operations, which the site created). Both are sent only to the public Koinos node, only to ask the station whether it will pay, before the user approves. Nothing is sent to the developer.
- Not sold, not used for unrelated purposes, not used for creditworthiness. Complies with the Limited Use requirements.
- The helper doesn't announce itself to websites: only the Mana Station site's own pages are told it's on. Its own page
  script learns the on/off setting, asks its question and gets the answer on a private channel named with a per-page-load
  secret, handed over by its isolated script at page start (audit-2026-10 W1-01: nothing a page can pre-set), and handled
  only with built-in functions saved before the site's scripts run (no Promises, no objects the page can hook). Tested
  (node and Chromium, test/chromium_secret_check.py): a site that asks the wallet to sign, and replaces built-ins or adds
  prototype getters such as Object.prototype.then, can't read the question, the answer or the secret, or answer for the
  helper. **It is not invisible** (audit-2026-10 W1-02): a site that looks closely can tell its wrapper around the page's
  message function apart from the browser's own, and can notice that something read its own signing request.

## Privacy policy URL
`<site>/privacy.html`

## Screenshots to take (1280×800)
1. The popup (on/off, covered today).
2. The helper page on the site: "Paid by Mana Station: your pass covered it".
3. Kondor's approval window showing the station as payer (mainnet).
