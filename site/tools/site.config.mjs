// One place for the website's public address and page list. When the domain is ready, change SITE and rebuild:
// every canonical link, social card, sitemap and robots.txt follows.
export const SITE = "https://bawcejawn.github.io/mana-station/";
export const NAME = "Mana Station";
export const OG_IMAGE = "og-image.png";
// name: breadcrumb label. priority/changefreq: sitemap. noindex: kept out of search results.
export const PAGES = {
  "index.html":       { name: "Home", priority: "1.0", changefreq: "weekly" },
  "get.html":         { name: "Get Mana", priority: "0.9", changefreq: "weekly" },
  "koinos-mana.html": { name: "What is Koinos Mana?", priority: "0.8", changefreq: "monthly", type: "article" },
  "play.html":        { name: "Try it free", priority: "0.8", changefreq: "monthly" },
  "helper.html":      { name: "Pass helper", priority: "0.7", changefreq: "monthly", app: "helper" },
  "help.html":        { name: "Help", priority: "0.7", changefreq: "monthly" },
  "terms.html":       { name: "Terms", priority: "0.3", changefreq: "yearly" },
  "privacy.html":     { name: "Privacy", priority: "0.3", changefreq: "yearly" },
  "owner.html":       { name: "Station owner", noindex: true },
  "404.html":         { name: "Not found", noindex: true, base: true },
};
