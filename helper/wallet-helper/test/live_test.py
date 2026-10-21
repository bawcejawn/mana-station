# Live test on the Koinos testnet with the REAL unpacked extension loaded in Chromium. A wallet that holds tUSDT but no
# KOIN and no Mana buys a pass on Get Mana (the station pays the purchase), then the helper page sends a transaction the
# way any app would: with the helper on, the station must pay; switched off in its popup, it must not.
# Usage: python3 live_test.py <wallet json {address, pk}> <scratch dir>   (testnet keys only)
import json, os, sys, time, urllib.request
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(HERE, "..", "..", "..", "site"); EXT = os.path.join(HERE, "..", "dist", "testnet")
W = json.load(open(sys.argv[1])); SCR = sys.argv[2]
KOILIB = open(os.path.join(HERE, "..", "..", "..", "contracts", "station", "node_modules", "koilib", "dist", "koinos.min.js")).read()
def local(route):
    name = route.request.url.split("example.test/")[1].split("#")[0].split("?")[0] or "index.html"
    ct = {"html": "text/html", "css": "text/css", "json": "application/json", "svg": "image/svg+xml", "js": "application/javascript"}[name.rsplit(".", 1)[1]]
    route.fulfill(body=open(os.path.join(SITE, name), "rb").read(), content_type=ct)
def rpc(route):
    req = urllib.request.Request(route.request.url, data=route.request.post_data_buffer, headers={"content-type": "application/json"}, method=route.request.method)
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return route.fulfill(status=r.status, body=r.read(), content_type="application/json", headers={"access-control-allow-origin": "*"})
        except Exception as e: err = e; time.sleep(2)
    route.fulfill(status=502, body=str(err))
def until(pg, js, secs=200):
    for _ in range(secs):
        if pg.evaluate(js): return True
        pg.wait_for_timeout(1000)
    return False
os.environ["PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS"] = "1"
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(os.path.join(SCR, "chrome-profile"), headless=False,
        args=["--headless=new", f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width": 1280, "height": 900})
    ctx.route("https://example.test/**", local)
    ctx.route("https://cdn.jsdelivr.net/npm/koilib@9.4.1/dist/koinos.min.js", lambda r: r.fulfill(body=KOILIB, content_type="application/javascript"))
    ctx.route("https://cdn.jsdelivr.net/npm/kondor-js@1.3.0/dist/kondor.min.js", lambda r: r.fulfill(body="", content_type="application/javascript"))
    ctx.route("https://testnet.koinosfoundation.org/**", rpc)
    ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(body="", content_type="text/css"))
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext_id = sw.url.split("/")[2]; print("extension loaded:", ext_id)
    pg = ctx.new_page(); logs = []; pg.on("console", lambda m: logs.append(m.text)); pg.on("dialog", lambda d: d.accept())
    pg.goto("https://example.test/index.html")
    pg.evaluate("s => { localStorage.setItem('ms.testwallets.v1', s); localStorage.setItem('ms.active', 'test:' + JSON.parse(s)[0].address); }", json.dumps([{"name": "Wallet 1", "address": W["address"], "pk": W["pk"], "created": 0}]))
    # 1. a pass, if the wallet has none (bought with no KOIN: the station pays the purchase)
    pg.goto("https://example.test/get.html#wallet"); pg.wait_for_timeout(10000)
    if not pg.is_visible("#passActive"):
        pg.check("#passSize input[value='1']", force=True); pg.check("#passDays input[value='1']", force=True); pg.wait_for_timeout(3000)
        pg.click("#passBuy"); until(pg, "document.querySelector('#passBuy').textContent !== 'Working…'"); pg.wait_for_timeout(3000)
        print("[buy pass]", pg.inner_text("#passMsg")[:200])
    # 2. the helper page: status, then a transaction sent the way any app would
    pg.goto("https://example.test/helper.html"); pg.wait_for_timeout(8000)
    print("checks:", pg.inner_text("#checks").replace("\n", " | "))
    pg.click("#tryBtn"); until(pg, "document.querySelector('#tryBtn').textContent !== 'Working…'"); pg.wait_for_timeout(2000)
    on = pg.inner_text("#tryMsg"); print("[helper on]", on[:200])
    # 3. the popup: today's count, then switch the helper off
    pop = ctx.new_page(); pop.goto(f"chrome-extension://{ext_id}/popup.html"); pop.wait_for_timeout(1500)
    print("popup:", pop.inner_text("body").replace("\n", " | ")[:300])
    pop.uncheck("#on"); pop.wait_for_timeout(500); pop.close()
    pg.click("#tryBtn"); until(pg, "document.querySelector('#tryBtn').textContent !== 'Working…'"); pg.wait_for_timeout(2000)
    off = pg.inner_text("#tryMsg"); print("[helper off]", off[:200])
    print("RESULT on:", "PASS" if "Paid by Mana Station" in on else "FAIL", "| off:", "PASS" if "Paid by Mana Station" not in off else "FAIL")
    pop = ctx.new_page(); pop.goto(f"chrome-extension://{ext_id}/popup.html"); pop.check("#on"); pop.close()
    ctx.close()
