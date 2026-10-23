// AB-019 (audit-fixes-1): every published page's Content-Security-Policy must allow exactly its own inline scripts.
// The hashes are recomputed here from the published bytes (what a browser hashes), so a page built from CRLF
// sources, or edited after the build, fails. Run: node --test site/tools/csp-hashes.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const site = new URL("../", import.meta.url);
const sources = fs.readdirSync(new URL("src/", site)).filter((f) => f.endsWith(".html"));
const pages = fs.readdirSync(site).filter((f) => f.endsWith(".html"));
const read = (f) => fs.readFileSync(new URL(f, site), "utf8");
const policy = (html) => html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/)?.[1];
// Executable inline scripts: a <script> with no src. JSON-LD isn't run, so the policy needn't allow it.
const inline = (html) => [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .filter(([, attrs = ""]) => !/\bsrc=/.test(attrs) && !/type="application\/ld\+json"/.test(attrs)).map(([, , js]) => js);
const sha = (js) => `'sha256-${crypto.createHash("sha256").update(js, "utf8").digest("base64")}'`;

test("every page built from site/src has a policy", () => {
  for (const f of sources) assert.ok(policy(read(f)), `${f} has no Content-Security-Policy`);
});

for (const f of pages) {
  const html = read(f), csp = policy(html);
  if (!csp) continue;                                                      // the old-link redirect pages have none
  test(`${f}: the policy's script hashes are exactly its inline scripts`, () => {
    assert.ok(!html.includes("\r"), `${f} has CR characters: rebuild it from LF sources`);
    const allowed = (csp.split(";").find((d) => d.trim().startsWith("script-src")) || "").match(/'sha256-[^']+'/g) || [];
    assert.deepEqual([...allowed].sort(), inline(html).map(sha).sort());
  });
}
