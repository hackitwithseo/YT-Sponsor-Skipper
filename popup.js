(function () {
  var DEFAULTS = {
    enabled: true, showOverlay: true, useSponsorBlock: true,
    keywords: document.getElementById("keywords").value.split("\n")
  };
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("status"), area = $("keywords"), saveTimer = null;

  function setStatus(t, c) { statusEl.textContent = t; statusEl.className = "status" + (c ? " " + c : ""); }
  function flash(t) {
    var p = statusEl.textContent, pc = statusEl.className;
    setStatus(t, "ok");
    setTimeout(function () { statusEl.textContent = p; statusEl.className = pc; }, 1100);
  }
  function updateCount() {
    var n = area.value.split("\n").filter(function (s) { return s.trim(); }).length;
    $("count").textContent = n + " words";
  }
  function writeKeywords() {
    var kw = area.value.split("\n").map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
    chrome.storage.local.set({ keywords: kw }, function () { flash("Saved"); });
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeKeywords, 400); }

  chrome.storage.local.get({ enabled: true, showOverlay: true, useSponsorBlock: true }, function (cfg) {
    $("enabled").checked = cfg.enabled;
    $("showOverlay").checked = cfg.showOverlay;
    $("useSponsorBlock").checked = cfg.useSponsorBlock;
    chrome.storage.local.get({ keywords: null }, function (k) {
      if (k.keywords && k.keywords.length) area.value = k.keywords.join("\n");
      else chrome.storage.local.set({ keywords: DEFAULTS.keywords });
      updateCount();
    });
  });

  ["enabled", "showOverlay", "useSponsorBlock"].forEach(function (key) {
    $(key).addEventListener("change", function (e) {
      var o = {}; o[key] = e.target.checked;
      chrome.storage.local.set(o);
      if (key === "enabled") setStatus(e.target.checked ? "Active" : "Paused", e.target.checked ? "ok" : "warn");
    });
  });

  area.addEventListener("input", function () { updateCount(); scheduleSave(); });
  $("save").addEventListener("click", function () { clearTimeout(saveTimer); writeKeywords(); });
  $("reset").addEventListener("click", function () {
    area.value = DEFAULTS.keywords.join("\n"); updateCount(); clearTimeout(saveTimer);
    chrome.storage.local.set({ keywords: DEFAULTS.keywords }, function () { flash("Defaults restored"); });
  });
  $("rescan").addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !/youtube\.com/.test(tab.url || "")) return setStatus("Open a YouTube video tab", "warn");
      chrome.tabs.sendMessage(tab.id, { type: "rescan" }, function () {
        if (chrome.runtime.lastError) return setStatus("Reload the YouTube tab", "warn");
        setStatus("Rescanning...");
      });
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !/youtube\.com/.test(tab.url || "")) return setStatus("Open a YouTube video tab", "warn");
    chrome.tabs.sendMessage(tab.id, { type: "status" }, function (res) {
      if (chrome.runtime.lastError || !res) return setStatus("Reload the YouTube tab", "warn");
      if (!res.enabled) return setStatus("Paused", "warn");
      if (!res.onWatchPage) return setStatus("No video open");
      if (!res.chapters) return setStatus("No chapters - SponsorBlock only");
      setStatus(res.segmentCount + " sponsor segment(s) detected", "ok");
    });
  });
})();