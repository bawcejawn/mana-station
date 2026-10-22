// Builds site/*.html from site/src/*.html, filling in the shared parts so every page has the same header, wallet chip
// and footer:  {{HEAD}}  {{TOP:home|get|play|helper|learn|help|owner|}}  {{FOOT}}.
// It also writes everything search engines and link previews read, from each page's <title> and description:
// canonical address, Open Graph and Twitter cards, structured data (breadcrumbs, FAQ from <details> after a
// data-faq marker, the site and app on Home), plus sitemap.xml, robots.txt and site.webmanifest.
// Run: node site/tools/build-pages.mjs        Address and page list: site/tools/site.config.mjs
import fs from "fs";
import crypto from "crypto";
import { SITE, NAME, OG_IMAGE, PAGES } from "./site.config.mjs";
const dir = new URL("../src/", import.meta.url), out = new URL("../", import.meta.url);
const part = (n) => fs.readFileSync(new URL("parts/" + n + ".html", dir), "utf8").replace(/\n$/, "");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const text = (h) => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").trim();
const urlOf = (f) => SITE + (f === "index.html" ? "" : f);
const today = new Date().toISOString().slice(0, 10);
const ORG = { "@type": "Organization", "@id": SITE + "#org", name: NAME, url: SITE, logo: SITE + "icon-512.png", sameAs: ["https://github.com/bawcejawn/mana-station"] };
const WEBSITE = { "@type": "WebSite", "@id": SITE + "#site", name: NAME, url: SITE, publisher: { "@id": SITE + "#org" }, inLanguage: "en",
  description: "Pays the Mana that Koinos transactions need: daily Mana passes for wallets and free, gasless transactions for an app's users." };

// AB-019: a Content-Security-Policy for every page. Scripts only from this site, the pinned jsDelivr files (which also
// carry integrity hashes) and the page's own inline scripts, each allowed by its sha256. 'unsafe-eval' is needed by
// koilib (its bundled protobufjs builds encoders with Function()). Network calls only to the Koinos RPC nodes below.
// frame-ancestors can't be set from a meta tag (GitHub Pages sends no headers); helper.html checks message senders instead.
const RPC = ["https://testnet.koinosfoundation.org", "https://harbinger-api.koinos.io", "https://api.koinos.io"];
function csp(html) {
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, js]) => `'sha256-${crypto.createHash("sha256").update(js, "utf8").digest("base64")}'`);
  return ["default-src 'self'", `script-src 'self' https://cdn.jsdelivr.net 'unsafe-eval' ${inline.join(" ")}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com", "img-src 'self' data:",
    `connect-src 'self' ${RPC.join(" ")}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
}

const built = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  const cfg = PAGES[f]; if (!cfg) throw new Error(`site.config.mjs has no entry for ${f}`);
  let s = fs.readFileSync(new URL(f, dir), "utf8");
  s = s.replace("{{HEAD}}", part("head").replace("%ROBOTS%", cfg.noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1"))
       .replace("{{FOOT}}", part("foot"));
  s = s.replace(/\{\{TOP:(\w*)\}\}/, (_, cur) => part("top").replace(/%(\w+)%/g, (_, k) => (k.toLowerCase() === cur ? ' aria-current="page"' : "")));

  const title = text(s.match(/<title>([\s\S]*?)<\/title>/)[1]);
  const desc = s.match(/<meta name="description" content="([^"]*)">/)?.[1]; if (!desc) throw new Error(`${f} has no meta description`);
  const url = urlOf(f), img = SITE + OG_IMAGE;
  const meta = [
    cfg.base ? `<base href="${SITE}">` : "",
    cfg.noindex ? "" : `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="${cfg.type || "website"}">`,
    `<meta property="og:site_name" content="${NAME}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${desc}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="Mana Station: never run out of Mana on Koinos">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${desc}">`,
    `<meta name="twitter:image" content="${img}">`,
  ].filter(Boolean);

  // Structured data
  const graph = [];
  const page = { "@type": cfg.type === "article" ? "Article" : "WebPage", "@id": url + "#page", url, name: title, description: text(desc), inLanguage: "en",
    isPartOf: { "@id": SITE + "#site" }, dateModified: today };
  if (cfg.type === "article") Object.assign(page, { headline: text(s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1]), author: { "@id": SITE + "#org" }, publisher: { "@id": SITE + "#org" }, image: img, mainEntityOfPage: url });
  if (f !== "index.html") {
    page.breadcrumb = { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE }, { "@type": "ListItem", position: 2, name: cfg.name, item: url }] };
  }
  if (!cfg.noindex) graph.push(page);
  if (f === "index.html") {
    graph.push(ORG, WEBSITE, {
      "@type": "WebApplication", "@id": SITE + "#app", name: NAME, url: SITE, applicationCategory: "FinanceApplication", operatingSystem: "Web",
      description: "Pays the Koinos transaction cost (Mana) for wallets and for an app's users: daily Mana passes and app plans, paid in vUSDT or vUSDC, no KOIN needed.",
      publisher: { "@id": SITE + "#org" },
      offers: [["1-day Mana pass, 1,000 Mana a day", "0.03"], ["7-day Mana pass, 1,000 Mana a day", "0.20"], ["30-day Mana pass, 1,000 Mana a day", "0.75"]]
        .map(([name, price]) => ({ "@type": "Offer", name, price, priceCurrency: "USD", url: SITE + "get.html" })),
    });
  }
  if (cfg.app === "helper") graph.push({ "@type": "SoftwareApplication", name: "Mana Station helper", applicationCategory: "BrowserApplication",
    operatingSystem: "Chrome, Brave, Microsoft Edge", url, description: text(desc), offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@id": SITE + "#org" } });
  const fi = s.indexOf("data-faq");
  if (fi > 0) {
    const qa = [...s.slice(fi).matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<div>([\s\S]*?)<\/div>\s*<\/details>/g)];
    if (qa.length) graph.push({ "@type": "FAQPage", "@id": url + "#faq", mainEntity: qa.map(([, q, a]) => ({ "@type": "Question", name: text(q), acceptedAnswer: { "@type": "Answer", text: text(a) } })) });
  }
  if (graph.length) meta.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": graph })}</script>`);
  s = s.replace(/(<meta name="description" content="[^"]*">)/, (m) => m + "\n  " + meta.join("\n  "));
  s = s.replace(/(<meta charset="utf-8">)/, (m) => m + `\n  <meta http-equiv="Content-Security-Policy" content="${csp(s)}">`);

  s = s.replace(/^<!doctype html>/i, (d) => d + "\n<!-- Built from site/src/" + f + " by site/tools/build-pages.mjs. Edit the source, not this file. -->");
  fs.writeFileSync(new URL(f, out), s);
  built.push(f);
}
// Sitemap, robots, app manifest
const order = Object.keys(PAGES).filter((f) => built.includes(f) && !PAGES[f].noindex);
fs.writeFileSync(new URL("sitemap.xml", out), `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by site/tools/build-pages.mjs from site.config.mjs. -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  order.map((f) => `  <url><loc>${urlOf(f)}</loc><lastmod>${today}</lastmod><changefreq>${PAGES[f].changefreq}</changefreq><priority>${PAGES[f].priority}</priority></url>`).join("\n") + "\n</urlset>\n");
fs.writeFileSync(new URL("robots.txt", out), `# Generated by site/tools/build-pages.mjs\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
fs.writeFileSync(new URL("site.webmanifest", out), JSON.stringify({ name: NAME, short_name: "Mana Station", description: WEBSITE.description,
  start_url: "./", scope: "./", display: "standalone", background_color: "#f7f6ff", theme_color: "#17114a",
  icons: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" }, { src: "icon-512.png", sizes: "512x512", type: "image/png" }, { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] }, null, 2) + "\n");
console.log("built", built.join(", "), "+ sitemap.xml, robots.txt, site.webmanifest");
