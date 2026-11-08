<p align="center">
  <img src="icon128.png" width="112" alt="Sponsor Skipper logo">
</p>

<h1 align="center">Sponsor Skipper</h1>

<p align="center">
  <img alt="manifest v3" src="[https://img.shields.io/badge/manifest-v3-000000](https://img.shields.io/badge/manifest-v3-000000)">
  <img alt="platform" src="[https://img.shields.io/badge/browser-Brave%20%7C%20Chrome%20%7C%20Edge-000000](https://img.shields.io/badge/browser-Brave%20%7C%20Chrome%20%7C%20Edge-000000)">
  <img alt="telemetry" src="[https://img.shields.io/badge/telemetry-none-000000](https://img.shields.io/badge/telemetry-none-000000)">
  <img alt="license" src="[https://img.shields.io/badge/license-MIT-000000](https://img.shields.io/badge/license-MIT-000000)">
</p>

<p align="center">Skips sponsor segments in YouTube videos using the chapter markers the uploader already published.<br>Leaves YouTube's own ad breaks completely alone.</p>

---

## Why

Sponsor reads are the one part of a video that the creator tagged for you. When a video has chapters, those reads are sitting right there in the timeline with names like `Sponsor`, `Ad break`, or `Thanks to our sponsor`. Sponsor Skipper reads that list, jumps the ranges it recognises, and tells you what it did.

It never touches pre-roll, mid-roll, or bumper ads. Those belong to YouTube and have their own skip button.

## Features

- **Chapter-based detection.** Reads the chapter panel and description timestamps, matches titles against a keyword list, and skips the matched ranges.
- **Never fights you.** Only fires when playback crosses into a segment naturally. Click into the middle of one yourself and it stays put.
- **Undo.** One click in the overlay, or `Alt+Shift+U`, puts you back at the start of the segment and leaves it alone until you exit and re-enter.
- **Overlay notice.** A small translucent box in the corner names the skipped segment, shows its length, and fades out after 10 seconds. It brightens on hover and can be switched off entirely.
- **SponsorBlock fallback.** Optional lookup against the SponsorBlock API for videos with no chapters. Sponsor category only — no intro, outro, or self-promo.
- **Master switch.** Toolbar toggle, popup switch, and `Alt+Shift+S`.
- **61 default keywords**, covering misspellings like `sponzor`, phrasings like `a word from our sponsor`, and adjacent categories like `merch` and `patreon`. Fully editable.
- **No telemetry, no accounts, no remote code.** Settings live in local extension storage.

## Install

Not on any store yet — load it unpacked.

1. Download or clone this repository into a folder.
2. Open `chrome://extensions` (or `brave://extensions`).
3. Turn on **Developer mode** in the top right.
4. Click **Load unpacked** and select the folder.
5. Pin the extension from the toolbar puzzle menu.

Chrome, Edge, and other Chromium browsers work the same way with their respective extensions pages.

## Usage

Open a video that has chapters. The popup status line reports how many sponsor segments were detected. Playback skips them automatically.

| Action | How |
| --- | --- |
| Toggle on / off | Toolbar popup, or `Alt+Shift+S` |
| Undo the last skip | Overlay button, or `Alt+Shift+U` |
| Turn off the overlay | Popup, **Skip overlay** |
| Turn off SponsorBlock lookups | Popup, **SponsorBlock fallback** |
| Edit keywords | Popup textarea, saves as you type |
| Force a rescan | Popup, **Rescan** |

Rebind the hotkeys at `brave://extensions/shortcuts`.

## How detection works

Segments are built by walking chapters in order. A chapter whose title matches a keyword becomes a range from that chapter's start to the next chapter's start, floored at 5 seconds and capped at 3 minutes. Adjacent hits merge, so `Sponsor` followed by `Promo code` collapses into a single skip.

SponsorBlock results, when enabled, merge into the same set as `sponsor`-category segments.

Keywords of three characters or fewer match on word boundaries, so `ad` and `ads` don't fire on "adventure" or "advice".

The skip engine checks `#movie_player.ad-showing` every frame and stands down while an ad is playing, since ad playback shares the same video element but not the same timeline.

## Limitations

- **Chapters are required** for keyword detection. A video without chapters relies entirely on SponsorBlock, if it's enabled.
- Chapters need at least three timestamps starting at `0:00` before YouTube renders them.
- Keyword matching is literal. Unusual chapter names need to be added manually.
- Segments longer than 3 minutes are cut at the 3 minute mark.
- Live streams and premieres are not specifically handled.
- SponsorBlock is a third-party service. It sees the video ID, not your account.

## Privacy

- No analytics, no tracking, no accounts.
- Settings are stored in `chrome.storage.local` and never leave the machine.
- The only network request is the optional SponsorBlock lookup, which sends a video ID to `sponsor.ajay.app`.

## Development

Load the folder unpacked and reload the card after any edit. `content.js` is the only file that runs on pages; `background.js` exists so SponsorBlock requests aren't subject to page CORS.

Tunables at the top of `content.js`:

```js
const MIN_SEGMENT = 5;    // ignore chapters shorter than this
const MAX_SKIP = 180;     // hard cap on one skip
const RETRY_DELAYS = [1200, 3000, 6500];  // chapter re-read attempts
```
