(() => {
  "use strict";

  const HOST_ID = "sponsor-skipper-host";
  const MARKER_CONTAINER_ID = "sb-timeline-previewbar";
  const MIN_SEGMENT = 3;
  const MAX_SKIP = 180;
  const RETRY_DELAYS = [1200, 3000, 6500];

  const DEFAULTS = {
    enabled: true,
    showOverlay: true,
    useSponsorBlock: true,
    keywords: [
      "sponsor", "sponsored", "sponsorship", "sponzor", "sponzored", "sponsoring",
      "sponsor segment", "sponsored segment", "sponsor break", "sponsor spot",
      "sponsor plug", "sponsored by", "brought to you by", "thanks to our sponsor",
      "thanks to", "our sponsor", "today's sponsor", "a word from our sponsor",
      "word from our sponsor", "message from our sponsor",
      "ad", "ads", "ad break", "ad read", "ad segment", "ad spot",
      "advertisement", "advertising", "commercial", "commercial break",
      "paid promotion", "includes paid promotion", "paid partnership",
      "promo", "promotion", "promotional", "promo code", "discount",
      "discount code", "deal", "offer", "coupon",
      "affiliate", "affiliate link", "referral", "referral link",
      "partner", "our partner", "partnership", "brand deal", "brand partnership",
      "merch", "merchandise", "merch plug", "merch store",
      "patreon", "membership", "shoutout", "shout out", "plug", "plug time", "giveaway"
    ]
  };

  let cfg = { ...DEFAULTS };
  let segments = [];
  let videoId = null;
  let video = null;
  let lastTime = 0;
  let suppressed = null;
  let overlayTimer = null;
  let rafId = null;
  let manualStart = null;

  chrome.storage.local.get(DEFAULTS, (stored) => {
    cfg = Object.assign({}, DEFAULTS, stored);
    if (cfg.enabled) start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) cfg[k] = changes[k].newValue;
    if (changes.enabled) changes.enabled.newValue ? start() : stop();
    if (changes.keywords) rebuild();
  });

  function start() {
    document.addEventListener("yt-navigate-finish", onNav, true);
    if (!rafId) rafId = requestAnimationFrame(tick);
    onNav();
  }

  function stop() {
    document.removeEventListener("yt-navigate-finish", onNav, true);
    segments = [];
    suppressed = null;
    manualStart = null;
    removeTimelineMarkers();
    hideOverlay();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onNav() {
    const id = new URLSearchParams(location.search).get("v");
    if (id === videoId) return;
    videoId = id || null;
    segments = [];
    suppressed = null;
    manualStart = null;
    video = null;
    removeTimelineMarkers();
    hideOverlay();
    if (!id) return;
    loadManualSegments();
    RETRY_DELAYS.forEach((d) => setTimeout(rebuild, d));
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!cfg.enabled || !videoId) return;

    if (!video || !video.isConnected) {
      video = document.querySelector("video.html5-main-video") || document.querySelector("#movie_player video");
      if (video) lastTime = video.currentTime;
      return;
    }

    if (document.querySelector("#movie_player.ad-showing")) {
      lastTime = video.currentTime;
      return;
    }

    const t = video.currentTime;

    if (video.duration && !document.getElementById(MARKER_CONTAINER_ID)) {
      renderTimelineMarkers();
    }

    if (suppressed !== null) {
      const s = segments.find((x) => x.start === suppressed);
      if (!s || t > s.end || t < s.start - 1.5) suppressed = null;
    }

    if (segments.length) {
      const seg = segments.find((s) => t >= s.start && t < s.end);
      if (seg && suppressed !== seg.start && lastTime < seg.start + 0.5 && t - lastTime < 1.5) {
        doSkip(seg);
      }
    }

    lastTime = video.currentTime;
  }

  function doSkip(seg) {
    lastTime = seg.end;
    video.currentTime = Math.max(seg.start, seg.end - 0.05);
    if (cfg.showOverlay) showOverlay(seg);
  }

  function parseTimestamp(txt) {
    const p = txt.trim().split(":").map(Number);
    if (p.some(isNaN)) return null;
    if (p.length === 2) return p[0] * 60 + p[1];
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    return null;
  }

  function collectChapters() {
    const found = new Map();

    document.querySelectorAll("ytd-macro-markers-list-item-renderer").forEach((el) => {
      const attr = el.getAttribute("start-time");
      let start = attr !== null ? parseFloat(attr) : null;
      if (start === null || isNaN(start)) {
        const tt = el.querySelector("#time");
        if (tt) start = parseTimestamp(tt.textContent || "");
      }
      const title = (
        (el.querySelector("#details h4") || {}).textContent ||
        (el.querySelector("h4") || {}).textContent || ""
      ).trim();
      if (start !== null && !isNaN(start) && title) found.set(Math.round(start), title);
    });

    if (found.size < 2) {
      const descEl =
        document.querySelector("#description-inline-expander") ||
        document.querySelector("ytd-watch-metadata #description");
      const desc = descEl ? descEl.textContent || "" : "";
      const re = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–—•|:.)]*\s*(.+)$/;
      desc.split("\n").forEach((line) => {
        const m = line.replace(/\u200b/g, "").match(re);
        if (!m) return;
        const start = parseTimestamp(m[1]);
        const title = m[2].trim();
        if (start !== null && title && title.length < 120) found.set(start, title);
      });
    }

    return [...found.entries()]
      .map(([start, title]) => ({ start, title }))
      .sort((a, b) => a.start - b.start);
  }

  function matchesKeyword(title) {
    const t = title.toLowerCase();
    return cfg.keywords.some((raw) => {
      const k = String(raw).toLowerCase().trim();
      if (!k) return false;
      if (k.length <= 3) {
        return new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t);
      }
      return t.includes(k);
    });
  }

  function buildFromChapters(chapters, duration) {
    const out = [];
    chapters.forEach((c, i) => {
      if (!matchesKeyword(c.title)) return;
      let end = i + 1 < chapters.length ? chapters[i + 1].start : Math.min(c.start + 120, duration);
      end = Math.min(end, c.start + MAX_SKIP, duration);
      if (end - c.start < MIN_SEGMENT) return;
      out.push({ start: c.start, end, title: c.title, src: "chapter" });
    });
    return out;
  }

  function merge(list) {
    const sorted = list.slice().sort((a, b) => a.start - b.start);
    const out = [];
    for (const s of sorted) {
      const prev = out[out.length - 1];
      if (prev && s.start <= prev.end + 0.5) {
        prev.end = Math.max(prev.end, s.end);
        if (s.src === "chapter" && prev.src !== "chapter") prev.title = s.title;
      } else out.push(Object.assign({}, s));
    }
    return out;
  }

  // Vykreslení černobílých strukturovaných proužků na lištu přehrávače YouTube
  function renderTimelineMarkers() {
    removeTimelineMarkers();
    if (!video || !isFinite(video.duration) || video.duration <= 0 || !segments.length) return;

    const progressContainer = document.querySelector(".ytp-progress-bar");
    if (!progressContainer) return;

    const container = document.createElement("div");
    container.id = MARKER_CONTAINER_ID;
    container.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99;";

    const duration = video.duration;

    segments.forEach((seg) => {
      const leftPercent = (seg.start / duration) * 100;
      const widthPercent = ((seg.end - seg.start) / duration) * 100;

      const marker = document.createElement("div");
      // Změněno na čistou moderní černobílou / stříbrnou texturu
      marker.style.cssText = `position:absolute;top:0;height:100%;left:${leftPercent}%;width:${widthPercent}%;background-color:rgba(255, 255, 255, 0.85);border: 1px solid rgba(0, 0, 0, 0.4);border-radius:1px;z-index:100;`;
      marker.title = `${seg.title} (${Math.round(seg.end - seg.start)}s)`;

      container.appendChild(marker);
    });

    progressContainer.appendChild(container);
  }

  function removeTimelineMarkers() {
    const existing = document.getElementById(MARKER_CONTAINER_ID);
    if (existing) existing.remove();
  }

  function loadManualSegments() {
    if (!videoId) return;
    chrome.storage.local.get({ manualSegments: {} }, (data) => {
      const videoManuals = data.manualSegments[videoId] || [];
      if (videoManuals.length > 0) {
        videoManuals.forEach(m => {
          segments.push({ start: m.start, end: m.end, title: "Manual Sponsor", src: "manual" });
        });
        segments = merge(segments);
        renderTimelineMarkers();
      }
    });
  }

  function rebuild() {
    if (!cfg.enabled || !videoId) return;
    const duration = video && isFinite(video.duration) ? video.duration : Infinity;
    let list = buildFromChapters(collectChapters(), duration);

    const apply = () => {
      chrome.storage.local.get({ manualSegments: {} }, (data) => {
        const videoManuals = data.manualSegments[videoId] || [];
        videoManuals.forEach(m => {
          list.push({ start: m.start, end: m.end, title: "Manual Sponsor", src: "manual" });
        });
        segments = merge(list).filter((s) => s.end > s.start && s.start < duration);
        renderTimelineMarkers();
      });
    };

    if (!cfg.useSponsorBlock) return apply();

    try {
      chrome.runtime.sendMessage({ type: "sb", videoId }, (res) => {
        if (chrome.runtime.lastError || !res || !res.segments) return apply();
        res.segments.forEach((s) => {
          if (!Array.isArray(s.segment) || s.segment.length < 2) return;
          const a = s.segment[0], b = s.segment[1];
          if (b - a < MIN_SEGMENT) return;
          list.push({ start: a, end: Math.min(b, a + MAX_SKIP), title: "Sponsor segment", src: "sb" });
        });
        apply();
      });
    } catch (e) {
      apply();
    }
  }

  // Monochromatický design plovoucího notifikačního boxu
  function ensureShadow() {
    let host = document.getElementById(HOST_ID);
    if (host) return host.shadowRoot;
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText = "position:fixed;bottom:84px;left:24px;z-index:2147483000;pointer-events:none;";
    document.documentElement.appendChild(host);
    const sh = host.attachShadow({ mode: "open" });
    sh.innerHTML = `
      <style>
        :host { all: initial; }
        .box {
          font: 12px/1.35 'Inter', system-ui, sans-serif;
          color: #fff; background: rgba(10,10,10,.85);
          -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
          border: 1px solid #262626;
          border-radius: 8px; padding: 8px 12px;
          display: flex; align-items: center; gap: 10px;
          max-width: 290px; opacity: 0; pointer-events: auto;
          transition: opacity .2s ease, transform .2s ease;
          transform: translateY(6px);
          box-shadow: 0 4px 20px rgba(0,0,0,.5);
        }
        .box.on { opacity: .9; transform: translateY(0); }
        .box:hover { opacity: 1; }
        .icon { font-size: 13px; opacity: .85; flex: 0 0 auto; }
        .txt { display: flex; flex-direction: column; min-width: 0; }
        .txt b { font-weight: 600; font-size: 12px; letter-spacing: -0.01em; }
        .sub {
          font-size: 11px; opacity: .7; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; max-width: 190px;
          font-family: monospace;
        }
        button {
          all: unset; cursor: pointer; font: inherit; font-size: 11px; font-weight: 500;
          padding: 4px 8px; border-radius: 4px;
          background: #ffffff; color: #000000; flex: 0 0 auto;
        }
        button:hover { background: #e5e5e5; }
        .x { padding: 4px 6px; background: transparent; color: #a3a3a3; opacity: .7; }
        .x:hover { background: #262626; color: #ffffff; opacity: 1; }
      </style>
      <div class="box" id="box">
        <span class="icon">&#9197;</span>
        <span class="txt"><b>Sponsor skipped</b><span class="sub" id="sub"></span></span>
        <button id="undo">Undo</button>
        <button class="x" id="x">&#10005;</button>
      </div>`;
    sh.getElementById("undo").addEventListener("click", undoLast);
    sh.getElementById("x").addEventListener("click", hideOverlay);
    return sh;
  }

  function showOverlay(seg) {
    const sh = ensureShadow();
    sh.getElementById("sub").textContent = seg.title + " - " + Math.round(seg.end - seg.start) + "s";
    sh.getElementById("box").classList.add("on");
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(hideOverlay, 10000);
  }

  function hideOverlay() {
    clearTimeout(overlayTimer);
    const host = document.getElementById(HOST_ID);
    if (host && host.shadowRoot) host.shadowRoot.getElementById("box").classList.remove("on");
  }

  function undoLast() {
    if (!video || !segments.length) return;
    const t = video.currentTime;
    const seg =
      segments.find((s) => t >= s.start - 3 && t <= s.end + 3) ||
      segments.slice().reverse().find((s) => s.start <= t);
    if (!seg) return;
    video.currentTime = seg.start;
    lastTime = seg.start;
    suppressed = seg.start;
    hideOverlay();
  }

  chrome.runtime.onMessage.addListener((msg, _s, respond) => {
    if (msg.type === "cmd-toggle") {
      cfg.enabled = !cfg.enabled;
      chrome.storage.local.set({ enabled: cfg.enabled });
      cfg.enabled ? start() : stop();
      respond({ enabled: cfg.enabled });
    } else if (msg.type === "cmd-undo") {
      undoLast();
    } else if (msg.type === "status") {
      respond({
        enabled: cfg.enabled,
        onWatchPage: !!videoId,
        segmentCount: segments.length,
        chapters: collectChapters().length,
        manualStart: manualStart
      });
    } else if (msg.type === "rescan") {
      rebuild();
    } else if (msg.type === "manual-start") {
      if (video) {
        manualStart = video.currentTime;
        respond({ success: true, time: manualStart });
      } else {
        respond({ success: false });
      }
    } else if (msg.type === "manual-stop") {
      if (video && manualStart !== null) {
        const manualEnd = video.currentTime;
        if (manualEnd > manualStart) {
          const newSeg = { start: manualStart, end: manualEnd };
          chrome.storage.local.get({ manualSegments: {} }, (data) => {
            const allManuals = data.manualSegments;
            if (!allManuals[videoId]) allManuals[videoId] = [];
            allManuals[videoId].push(newSeg);
            chrome.storage.local.set({ manualSegments: allManuals }, () => {
              manualStart = null;
              rebuild();
              respond({ success: true });
            });
          });
          return true;
        }
      }
      manualStart = null;
      respond({ success: false });
    }
    return true;
  });
})();