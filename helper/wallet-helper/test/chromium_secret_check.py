# AB-038 in a real Chromium: a site that puts getters on prototypes (Object.prototype.then and others) and replaces
# built-ins must never reach the helper's per-load secret, including through window.event while the helper handles its
# private events. page.js runs as the page's first script (as at document_start), then a stand-in bridge (built-ins
# saved first, like the extension's own world), then the site's traps. The page is served by a local route: no network.
# Usage: node helper/wallet-helper/build.mjs testnet && python3 helper/wallet-helper/test/chromium_secret_check.py [page.js]
import json, os, sys
from playwright.sync_api import sync_playwright
PAGE = open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "dist", "testnet", "page.js")).read()
ME = "1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y"; ST = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc"
CHAIN = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=="
OP = {"call_contract": {"contract_id": "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", "entry_point": 1, "args": "ChkA"}}
BRIDGE = """
(() => { const P = JSON.parse, S = JSON.stringify, CE = CustomEvent, dispatch = EventTarget.prototype.dispatchEvent,
  listen = EventTarget.prototype.addEventListener, det = Object.getOwnPropertyDescriptor(CustomEvent.prototype, 'detail').get,
  st = setTimeout, rApply = Reflect.apply, push = (a, v) => { a[a.length] = v; };
  const t = document.documentElement.getAttribute('data-ms-helper'); document.documentElement.removeAttribute('data-ms-helper');
  window.__asks = []; window.__answer = true;
  rApply(listen, document, ['ms-ask-' + t, (e) => { const d = P(rApply(det, e, [])); window.__asks.length += 1;
    st(() => rApply(dispatch, document, [new CE('ms-answer-' + t, { detail: S({ id: d.id, pay: window.__answer, rcLimit: d.rcLimit }) })]), 0); }]); })();
"""
SITE = """
// Records are arrays with no prototype, so the site's own index setters can't swallow them; __off stops the traps
// before the results are read.
window.__seen = Object.setPrototypeOf([], null); window.__wallet = Object.setPrototypeOf([], null); window.__off = false;
(() => { const seen = window.__seen, RA = Reflect.apply, gopn = Object.getOwnPropertyNames, gopd = Object.getOwnPropertyDescriptor; let busy = false;
  const look = (x, d) => { if (d > 4 || x == null) return; if (typeof x === 'string') { seen[seen.length] = x; return; }
    if (typeof x !== 'object' && typeof x !== 'function') return; let ks = []; try { ks = gopn(x); } catch (e) { return; }
    for (let i = 0; i < ks.length && i < 50; i++) { let v; try { const p = gopd(x, ks[i]); v = p && 'value' in p ? p.value : undefined; } catch (e) { continue; } look(v, d + 1); } };
  const note = (self, args) => { if (busy || window.__off) return; busy = true; try { const e = window.event; if (e) { seen[seen.length] = '' + e.type; look(e.detail, 0); } look(self, 0);
    for (let i = 0; i < args.length; i++) look(args[i], 0); } catch (x) {} finally { busy = false; } };
  const getter = (o, k) => Object.defineProperty(o, k, { configurable: true, get() { note(this, []); return undefined; }, set(v) { note(this, [v]); } });
  for (const k of ['then', 'id', 'pay', 'rcLimit', 'toJSON', 'detail', 'bubbles', 'cancelable', 'composed', '0', '1', '2', 'payee', 'operations']) getter(Object.prototype, k);
  for (const k of ['toJSON', '0', '1']) getter(Array.prototype, k);
  const wrap = (o, k) => { const f = o[k]; o[k] = function (...a) { note(this, a); return RA(f, this, a); }; };
  for (const [o, ks] of [[Promise.prototype, ['then', 'catch']], [Array.prototype, ['concat', 'push', 'slice', 'join', 'map']], [RegExp.prototype, ['exec', 'test']],
    [String.prototype, ['slice', 'padStart', 'charCodeAt', 'indexOf']], [Number.prototype, ['toString']], [JSON, ['parse', 'stringify']],
    [Object, ['keys', 'create']], [Function.prototype, ['call', 'apply', 'bind']]]) for (const k of ks) wrap(o, k);
  Object.defineProperty(Promise.prototype, 'constructor', { configurable: true, get() { note(this, []); return Promise; } }); })();
addEventListener('message', (e) => { const d = e.data; if (d && d.to === 'popup' && d.command) { window.__wallet[window.__wallet.length] = JSON.stringify(d); } });
"""
REQ = """(id) => window.postMessage({ id, command: 'signer:signTransaction', to: 'popup', args: { signerAddress: '%s',
  transaction: { header: { chain_id: '%s', rc_limit: '19000000' }, operations: [%s] } } }, '*')""" % (ME, CHAIN, json.dumps(OP))
results = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    body = "<!doctype html><html><head><script>" + PAGE + "</script><script>" + BRIDGE + "</script><script>" + SITE + "</script><title>t</title></head></html>"
    pg.route("https://example.test/", lambda r: r.fulfill(body=body, content_type="text/html"))
    pg.goto("https://example.test/")
    for answer in ["true", "false"]:
        pg.evaluate("window.__answer = %s" % answer)
        for i in range(2): pg.evaluate(REQ, "req-%s-%d" % (answer, i)); pg.wait_for_timeout(300)
    pg.evaluate("window.__off = true")
    allseen = [x for x in json.loads(pg.evaluate("JSON.stringify(Array.from(window.__seen))")) if isinstance(x, str)]
    seen = [x for x in allseen if x.startswith("ms-ask-") or x.startswith("ms-answer-") or "data-ms" in x]
    asks = pg.evaluate("window.__asks.length"); wallet = [json.loads(x) for x in json.loads(pg.evaluate("JSON.stringify(Array.from(window.__wallet))"))]
    print("(the traps recorded %d strings)" % len(allseen))
    payers = [w["args"]["transaction"]["header"].get("payer") for w in wallet]
    def check(name, ok, info=""): results.append(ok); print(("PASS " if ok else "FAIL ") + name, "" if ok else info)
    check("the extension was asked 4 times", asks == 4, str(asks))
    check("no site trap saw the private channel or its secret (AB-038)", seen == [], json.dumps(seen[:4]))
    check("the station became payer exactly when it said yes", payers == [ST, ST, None, None], json.dumps(payers))
    b.close()
print("%d/%d passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
