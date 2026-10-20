# Mana Station website

A plain static site: no build step, no framework, no JavaScript. Two pages share one stylesheet.

- `index.html`: home (what it is, who it's for, prices, first apps, status)
- `how-it-works.html`: the guide for app builders (five steps, pricing, questions), plus a short section for players
- `console.html`: the owner console (not indexed). It lists connected apps, paid allowances and council proposals live from the chain, and lets the owner connect, change or disconnect apps and pause the station through Kondor. Council members can pause, propose, approve, veto and execute. It loads koilib and kondor-js from jsDelivr.
- `station-abi.json`: copy of `contracts/station/abi/station.koilib.json`. Copy it again after any contract change.
- `styles.css`: all styling. Colors and fonts are tokens at the top, with light and dark themes.

**See it locally:** open `index.html` in a browser, or run `npx serve site` from the repo root.

**Publish:** any static host works (GitHub Pages, Cloudflare Pages, Netlify). Point it at this `site/` folder.

**Before launch:**
1. Add `<link rel="canonical">` and `og:url` to both pages.
2. Fill in the domain in `sitemap.xml` and `robots.txt`.
3. Add an `og:image` (1200×630).
4. Update prices, limits and the status timeline if they change. The copy matches `contracts/station/config/mainnet.proposed.json` and the draft terms in `Station.ts`.
