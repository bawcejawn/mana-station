// Copies only the public website files into a folder ready for a $0 GitHub Pages repo (e.g. bawcejawn/mana-station-site):
//   node site/tools/export-site.mjs <out dir>
// Builds pages and site data first. Leaves out sources, tools and notes.
import fs from "fs"; import path from "path"; import { execSync } from "child_process"; import { fileURLToPath } from "url";
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(process.argv[2] || path.join(site, "..", "site-export"));
execSync(`node "${path.join(site, "tools/make-site-data.mjs")}"`, { stdio: "inherit" });
execSync(`node "${path.join(site, "tools/build-pages.mjs")}"`, { stdio: "inherit" });
fs.mkdirSync(out, { recursive: true });
const keep = (f) => /\.(html|js|css|svg|json|txt|xml|png|webmanifest)$/.test(f) && !["README.md"].includes(f);
for (const f of fs.readdirSync(site)) if (fs.statSync(path.join(site, f)).isFile() && keep(f)) fs.copyFileSync(path.join(site, f), path.join(out, f));
fs.writeFileSync(path.join(out, ".nojekyll"), "");          // serve files as they are
fs.writeFileSync(path.join(out, "README.md"), "# Mana Station website\n\nPublished copy of `site/` from the Mana Station repo (built by `site/tools/export-site.mjs`). Edit the source there, not here.\n");
console.log("exported website to " + out);
