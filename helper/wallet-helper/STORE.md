# Store listing: Mana Station helper

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
- **Content scripts on all sites (`<all_urls>`):** Koinos apps can be on any website. The helper must see a site's signing request to the wallet on whichever Koinos site the user visits. It acts only on Koinos signing requests and ignores everything else on the page.
- **`storage`:** keeps the on/off setting and today's count of covered transactions, in the browser only.
- **Host permission for the Koinos node (`https://api.koinos.io/*`):** to ask the Mana Station contract the read-only question "would you pay for this transaction?".
- **Remote code:** none. All code ships in the package.

## Data use disclosures
- Collects: none of the store's listed categories is collected by the developer.
- Sends to a third party: when a site asks the wallet to sign, the wallet address and the transaction's operations go to the public Koinos node, only to ask the station whether it will pay. Nothing is sent to the developer.
- Not sold, not used for unrelated purposes, not used for creditworthiness.

## Privacy policy URL
`<site>/privacy.html`

## Screenshots to take (1280×800)
1. The popup (on/off, covered today).
2. The helper page on the site: "Paid by Mana Station: your pass covered it".
3. Kondor's approval window showing the station as payer (mainnet).
