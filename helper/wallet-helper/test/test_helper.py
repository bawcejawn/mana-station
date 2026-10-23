# Rule tests for the helper's page part (dist/testnet/page.js): a stand-in wallet records what it receives, and a
# stand-in bridge answers the helper's question. Checks when the helper changes the payer and when it must not.
# Usage: node helper/wallet-helper/build.mjs testnet && python3 helper/wallet-helper/test/test_helper.py
import json, os
from playwright.sync_api import sync_playwright
PAGE = open(os.path.join(os.path.dirname(__file__), "..", "dist", "testnet", "page.js")).read()
ST = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc"; ME = "1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y"; OTHER = "1N6yd5SzAQaHe484vkV7pFhmYiGfQh2Cuy"
CHAIN = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=="
OP = {"call_contract": {"contract_id": "1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX", "entry_point": 1, "args": "ChkA"}}
MOCK = """
window.__seen = []; window.__asks = []; window.__answer = true; window.__noBridge = false; window.__failNext = false;
// The stand-in bridge (AB-026): like bridge.js, it takes the per-load secret from the DOM and answers on the events it names.
(() => { const t = (() => { const b = new Uint8Array(16); crypto.getRandomValues(b); const tok = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); const give = () => document.dispatchEvent(new CustomEvent('ms-hello-b', { detail: tok })); const onP = () => { document.removeEventListener('ms-hello-p', onP); give(); }; document.addEventListener('ms-hello-p', onP); give(); return tok; })();
  document.addEventListener('ms-ask-' + t, (e) => { if (window.__noBridge) return; const d = JSON.parse(e.detail); window.__asks.push(d);
    setTimeout(() => document.dispatchEvent(new CustomEvent('ms-answer-' + t, { detail: JSON.stringify({ id: d.id, pay: window.__answer, rcLimit: d.rcLimit }) })), 0); }); })();
window.addEventListener('message', (e) => { const d = e.data;
  if (!d || d.to !== 'popup' || !d.command) return;
  window.__seen.push(JSON.parse(JSON.stringify(d)));
  const fail = window.__failNext; window.__failNext = false;
  setTimeout(() => window.postMessage(fail ? { id: d.id, error: 'has not authorized' } : { id: d.id, result: { ok: true } }, '*'), 10); });
window.req = (msg) => new Promise((res) => { const done = (e) => { if (e.data && e.data.id === msg.id && !e.data.command) { window.removeEventListener('message', done); res(window.__seen[window.__seen.length - 1]); } };
  window.addEventListener('message', done); window.postMessage(msg, '*'); });
window.msg = (header, extra, args) => ({ id: 'r' + Math.random(), command: 'signer:sendTransaction', to: 'popup',
  args: Object.assign({ signerAddress: '%s', transaction: Object.assign({ header, operations: [%s] }, extra || {}) }, args || {}) });
""" % (ME, json.dumps(OP))
results = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    # audit-fixes-1 (AB-026): page.js and the stand-in bridge share the per-load secret through document.documentElement,
    # which a Playwright init script runs too early to have. Chrome's document_start content scripts do have it, so the two
    # run here as the page's first scripts instead (still before any other script, as at document_start).
    body = "<!doctype html><html><head><script>" + PAGE + "</script><script>" + MOCK + "</script><title>t</title></head></html>"
    pg.route("https://example.test/", lambda r: r.fulfill(body=body, content_type="text/html"))
    pg.goto("https://example.test/")
    H = lambda **k: {"chain_id": CHAIN, "rc_limit": "19000000", "payer": ME, **k}
    def run(name, header, expect_station, extra=None, args=None, rc=None):
        t = pg.evaluate("([h, x, a]) => req(msg(h, x, a))", [header, extra or {}, args or {}])["args"]["transaction"]["header"]
        ok = (t.get("payer") == ST and t.get("payee") == ME) if expect_station else (t.get("payer") == header.get("payer") and t.get("payee") == header.get("payee"))
        if ok and rc: ok = t.get("rc_limit") == rc
        results.append(ok); print(("PASS " if ok else "FAIL ") + name, "" if ok else json.dumps(t))
    def asked(): return pg.evaluate("window.__asks.length")
    run("station says yes: station pays, user is payee, the site's sensible limit is kept", H(), True, rc="19000000")
    run("a bigger transaction keeps its own limit (1.5 Mana, under the station's maximum)", H(rc_limit="150000000"), True, rc="150000000")
    run("a limit above the station's maximum (a whole 30 Mana balance) is replaced by the 0.5 Mana default", H(rc_limit="3000000000"), True, rc="50000000")
    run("a limit of 0 (wallet with no Mana) is replaced by the default", H(rc_limit="0"), True, rc="50000000")
    pg.evaluate("window.__answer = false"); run("station says no: left alone", H(), False); pg.evaluate("window.__answer = true")
    a0 = asked(); run("someone else already pays: left alone", H(payer=OTHER), False); ok = asked() == a0; results.append(ok); print(("PASS " if ok else "FAIL ") + "  ...and the station isn't even asked")
    run("another network: left alone", H(chain_id="EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA=="), False)
    run("already signed by someone: left alone", H(), False, {"signatures": ["abc"]})
    run("the site set a payer in its send options: left alone", H(), False, None, {"optsSend": {"payer": OTHER}})
    run("an upload: left alone (uploads use tickets on the site)", H(), False, {"operations": [{"upload_contract": {"contract_id": ME}}]})
    pg.evaluate("window.__failNext = true"); run("changed, then refused when it landed", H(), True)
    run("after a refusal it stands aside: the user's own Mana pays", H(), False)
    pg.evaluate("window.postMessage({ __manaStation: 'state', enabled: false }, '*')"); pg.wait_for_timeout(100)
    a0 = asked(); run("switched off in the popup: left alone", {"chain_id": CHAIN, "rc_limit": "19000000", "payer": OTHER[:-1] + "z"}, False); ok = asked() == a0; results.append(ok); print(("PASS " if ok else "FAIL ") + "  ...and the station isn't asked")
    pg.evaluate("window.postMessage({ __manaStation: 'state', enabled: true }, '*')"); pg.wait_for_timeout(100)
    # A site answers the helper's question itself with a junk limit: ignored. (AB-026: it no longer even sees the question.)
    me2 = "1PWeFG4pPtjZZoYvcmGb6mYhMYJjnkHrmz"
    pg.evaluate("window.__noBridge = true")
    t = pg.evaluate("""() => { const m = msg({ chain_id: '%s', rc_limit: '19000000', payer: '%s' }); m.args.signerAddress = '%s';
        const f = (e) => { const d = e.data; if (d && d.__manaStation === 'ask') window.postMessage({ __manaStation: 'answer', id: d.id, pay: true, rcLimit: { evil: 1 } }, '*'); };
        window.addEventListener('message', f); return req(m).then((s) => { window.removeEventListener('message', f); return s; }); }""" % (CHAIN, me2, me2))
    ok = t["args"]["transaction"]["header"].get("payer") == me2; results.append(ok); print(("PASS " if ok else "FAIL ") + "a forged answer with a junk limit is ignored")
    run("no answer within 3 s: passed on unchanged", {"chain_id": CHAIN, "rc_limit": "19000000", "payer": me2}, False, None, {"signerAddress": me2})
    pg.evaluate("window.__noBridge = false")
    ME3 = "1HGh4rQvYYcm4fGiU1C7vQoSxnUiGa9Ah7"                      # a wallet the helper isn't standing aside for
    # The site swaps the operations between the helper's check and the wallet: the wallet gets exactly what was checked.
    t = pg.evaluate("""() => { let n = 0; const ops = [%s], swapped = [{ call_contract: { contract_id: '%s', entry_point: 99, args: '' } }];
        const tx = { header: { chain_id: '%s', rc_limit: '19000000', payer: '%s' } };
        Object.defineProperty(tx, 'operations', { enumerable: true, get: () => (n++ === 0 ? ops : swapped) });
        const id = 'g' + Math.random(); const m = { id, command: 'signer:sendTransaction', to: 'popup', args: { signerAddress: '%s', transaction: tx } };
        return new Promise((res) => { const done = (e) => { if (e.data && e.data.id === id && !e.data.command) { window.removeEventListener('message', done); res({ seen: window.__seen[window.__seen.length - 1], asked: window.__asks[window.__asks.length - 1] }); } };
          window.addEventListener('message', done); window.postMessage(m); }); }""" % (json.dumps(OP), ME, CHAIN, ME3, ME3))
    ok = t["seen"]["args"]["transaction"]["header"].get("payer") == ST and json.dumps(t["seen"]["args"]["transaction"]["operations"]) == json.dumps(t["asked"]["operations"]); results.append(ok)
    print(("PASS " if ok else "FAIL ") + "the wallet receives exactly the operations the station was asked about")
    ok = pg.evaluate("window.__manaStationHelper === true"); results.append(ok); print(("PASS " if ok else "FAIL ") + "the 'helper is on' marker shows on the Mana Station site only")
    b.close()
print(f"{sum(results)}/{len(results)} passed")
