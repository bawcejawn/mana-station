const C = self.MS_CONFIG;
document.getElementById("net").textContent = (C.network === "mainnet" ? "Koinos mainnet" : "Koinos " + C.network + " (test)") + " · station " + C.station.slice(0, 6) + "…" + C.station.slice(-4);
document.getElementById("more").href = C.site + "helper.html";
document.getElementById("privacy").href = C.site + "privacy.html";
const on = document.getElementById("on");
chrome.storage.local.get({ enabled: true, coveredDay: "", covered: 0 }).then((s) => {
  on.checked = s.enabled;
  document.getElementById("count").textContent = s.coveredDay === new Date().toISOString().slice(0, 10) ? s.covered : 0;
});
on.addEventListener("change", () => chrome.storage.local.set({ enabled: on.checked }));
