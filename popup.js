(function () {
  // === 1. ANIMACE POHYBUJÍCÍCH SE TEČEK ===
  var canvas = document.getElementById('popup-canvas');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var particles = [];

    function initPopupCanvas() {
      canvas.width = 320;
      canvas.height = 650;
      particles = [];
      for (var i = 0; i < 40; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          size: Math.random() * 1.5 + 0.6
        });
      }
    }

    function animatePopup() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(animatePopup);
    }

    initPopupCanvas();
    animatePopup();
  }

  // === 2. OVLÁDÁNÍ POPUPU A LOGIKA ROZŠÍŘENÍ ===
  var DEFAULTS = {
    enabled: true, showOverlay: true, useSponsorBlock: true,
    keywords: document.getElementById("keywords").value.split("\n")
  };
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $("status"), area = $("keywords"), manualBtn = $("manualBtn"), saveTimer = null;

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

  manualBtn.addEventListener("click", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !/youtube\.com/.test(tab.url || "")) return setStatus("Open a YouTube video tab", "warn");

      chrome.tabs.sendMessage(tab.id, { type: "status" }, function (res) {
        if (chrome.runtime.lastError || !res) return setStatus("Reload the YouTube tab", "warn");

        if (res.manualStart === null) {
          chrome.tabs.sendMessage(tab.id, { type: "manual-start" }, function (r) {
            if (r && r.success) {
              manualBtn.textContent = "Stop Manual Blocking";
              manualBtn.classList.add("recording");
              setStatus("Recording sponsor from " + Math.round(r.time) + "s...", "warn");
            }
          });
        } else {
          chrome.tabs.sendMessage(tab.id, { type: "manual-stop" }, function (r) {
            if (r && r.success) {
              manualBtn.textContent = "Start/Stop Manual Blocking Of Sponsors";
              manualBtn.classList.remove("recording");
              setStatus("Manual sponsor saved & marked!", "ok");
            } else {
              setStatus("Error: Stop time must be after start", "warn");
            }
          });
        }
      });
    });
  });

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var tab = tabs[0];
    if (!tab || !/youtube\.com/.test(tab.url || "")) return setStatus("Open a YouTube video tab", "warn");
    chrome.tabs.sendMessage(tab.id, { type: "status" }, function (res) {
      if (chrome.runtime.lastError || !res) return setStatus("Reload the YouTube tab", "warn");
      
      if (res.manualStart !== null) {
        manualBtn.textContent = "Stop Manual Blocking";
        manualBtn.classList.add("recording");
      } else {
        manualBtn.textContent = "Start/Stop Manual Blocking Of Sponsors";
      }

      if (!res.enabled) return setStatus("Paused", "warn");
      if (!res.onWatchPage) return setStatus("No video open");
      setStatus(res.segmentCount + " sponsor segment(s) detected", "ok");
    });
  });
})();