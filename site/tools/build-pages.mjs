// Builds site/*.html from site/src/*.html, filling in the shared parts so every page has the same header, wallet chip
// and footer:  {{HEAD}}  {{TOP:get|play|help|owner|}}  {{FOOT}}.   Run: node site/tools/build-pages.mjs
import fs from "fs";
const dir = new URL("../src/", import.meta.url), out = new URL("../", import.meta.url);
const part = (n) => fs.readFileSync(new URL("parts/" + n + ".html", dir), "utf8").replace(/\n$/, "");
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".html"))) {
  let s = fs.readFileSync(new URL(f, dir), "utf8");
  s = s.replace("{{HEAD}}", part("head")).replace("{{FOOT}}", part("foot"));
  s = s.replace(/\{\{TOP:(\w*)\}\}/, (_, cur) => part("top").replace(/%(\w+)%/g, (_, k) => (k.toLowerCase() === cur ? ' aria-current="page"' : "")));
  s = s.replace(/^<!doctype html>/i, (d) => d + "\n<!-- Built from site/src/" + f + " by site/tools/build-pages.mjs. Edit the source, not this file. -->");
  fs.writeFileSync(new URL(f, out), s);
  console.log("built", f);
}
