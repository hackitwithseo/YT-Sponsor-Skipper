chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.type === "sb") {
    const url =
      "https://sponsor.ajay.app/api/skipSegments?videoID=" +
      encodeURIComponent(msg.videoId) +
      "&categories=" + encodeURIComponent('["sponsor","sponsor_unlisted"]');
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => respond({ segments: Array.isArray(d) ? d : [] }))
      .catch(() => respond({ segments: [] }));
    return true;
  }
});

chrome.commands.onCommand.addListener(async (cmd) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: cmd === "undo" ? "cmd-undo" : "cmd-toggle" }).catch(() => {});
});