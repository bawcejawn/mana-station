# Offline test of the wallet helper's logic: a stand-in Kondor records what it receives; the station's would_pay
# answer is stubbed. Checks every rule of when the helper changes the payer and when it leaves a request alone.
from playwright.sync_api import sync_playwright
import json, base64
PAGE = open(__import__("os").path.join(__import__("os").path.dirname(__file__), "..", "extension", "page.js")).read()
ST = "1JnSnBNHrKxWGwWeriuhK1DrG5rv3KRFqc"; ME = "1FkkngqWktuen41Exa13XUfHsGNrvwHm3Y"; OTHER = "1N6yd5SzAQaHe484vkV7pFhmYiGfQh2Cuy"
CHAIN = "EiAIKVvm6-V2qmsmUvPJy09vCCLbtn9lHFpwrJbcTIEWRQ=="
YES = base64.urlsafe_b64encode(bytes([0x08, 0x01, 0x12, 0x04]) + b"pass").decode().rstrip("=")
state = {"answer": YES, "calls": 0}
def rpc(route):
    state["calls"] += 1
    route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"}, body=json.dumps({"jsonrpc": "2.0", "id": 1, "result": {"result": state["answer"]}}))
MOCK = """
window.__seen = [];
window.addEventListener('message', (e) => { const d = e.data; if (!d || d.to !== 'popup' || !d.command) return;
  window.__seen.push(JSON.parse(JSON.stringify(d.args.transaction)));
  const fail = window.__failNext; window.__failNext = false; setTimeout(() => window.postMessage(fail ? { id: d.id, error: 'has not authorized' } : { id: d.id, result: { ok: true } }, '*'), 10); });
window.req = (header, extra = {}) => new Promise((res) => { const id = 'r' + Math.random(); const done = (e) => { if (e.data && e.data.id === id && !e.data.command) { window.removeEventListener('message', done); res(window.__seen[window.__seen.length - 1]); } };
  window.addEventListener('message', done);
  window.postMessage({ id, command: 'signer:sendTransaction', to: 'popup', args: { signerAddress: '%s', transaction: { header, operations: [{ call_contract: { contract_id: '1MKjQ9zfcLetsQZD9g4JgdxoEpW6Z3kiQX', entry_point: 1, args: 'ChkA' } }], ...extra } } }, '*'); });
""" % ME
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.route("https://example.test/", lambda r: r.fulfill(body="<!doctype html><title>t</title>", content_type="text/html"))
    pg.route("https://testnet.koinosfoundation.org/**", rpc)
    pg.add_init_script(PAGE); pg.add_init_script(MOCK)
    pg.goto("https://example.test/")
    H = lambda **k: {"chain_id": CHAIN, "rc_limit": "100000000", "payer": ME, **k}
    def run(name, header, expect_station, extra=None, rc=None):
        t = pg.evaluate("([h, x]) => req(h, x)", [header, extra or {}]); h = t["header"]
        ok = (h.get("payer") == ST and h.get("payee") == ME) if expect_station else (h.get("payer") == header.get("payer") and h.get("payee") == header.get("payee"))
        if rc and ok: ok = h.get("rc_limit") == rc
        print(("PASS " if ok else "FAIL ") + name, json.dumps(h))
    run("station says yes: station pays, user is payee", H(), True)
    run("a large limit is capped at the station's maximum", H(rc_limit="3000000000"), True, rc="200000000")
    state["answer"] = ""; run("station says no: left alone", H(), False); state["answer"] = YES
    c0 = state["calls"]; run("someone else already pays (app sponsor / free mana): left alone, station not asked", H(payer=OTHER), False); print(("PASS " if state["calls"] == c0 else "FAIL ") + "no question asked for it")
    run("another network: left alone", H(chain_id="EiBZK_GGVP0H_fXVAM3j6EAuz3-B-l3ejxRSewi7qIBfSA=="), False)
    run("already signed by someone: left alone", H(), False, {"signatures": ["abc"]})
    pg.evaluate("window.__failNext = true"); run("rewritten, then refused on landing", H(), True)
    run("after a refusal: stands aside (user's own Mana)", H(), False)
    print("page errors:", pg.evaluate("window.__manaStationHelper && window.__manaStationHelper.network"))
    b.close()
