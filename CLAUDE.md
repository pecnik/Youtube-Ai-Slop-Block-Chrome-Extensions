# YT-AI-Block

Chrome extension (Manifest V3) for blacklisting "AI-slop" YouTube channels. Load `src/` as the unpacked extension.

This file describes **what the extension should do**, so it can be rebuilt if YouTube changes its markup. The "Current implementation" sections describe how it's done today, and those details are the parts most likely to break.

## Feature spec

### Blacklist
- A list of channels, stored in `chrome.storage.sync` under the key `blacklist` as `[{ id, name, handle, addedAt }]`.
  - `id` is the channel's `UC…` id and is the primary key. `handle` is `@name`.
- A channel matches if a video's channel id equals `id`, or its handle equals `handle` (ignoring case).

### On YouTube search results
- Each video has a toggle button next to the channel name:
  - **Not blacklisted:** a dark-grey "Blacklist Channel" button, visible only on hover. Clicking it adds the channel.
  - **Blacklisted:** a bright red, bold, uppercase "BLACKLISTED" button, always visible. Clicking it removes the channel.
  - **While working:** "…".
- Blacklisted videos are either **marked** or **hidden**, depending on the popup setting:
  - **Marked:** red outline (`2px solid red`, `border-radius: 4px`), the thumbnail covered by `src/ai-slop.jpg`. The hover preview still plays.
  - **Hidden:** removed from the results completely.
- Changes apply right away, with no page reload: when you click the button, when you edit the list in the popup, and when you change the setting.

### Watch page sidebar (recommended videos)
- Same toggle button as other cards (top-left, on hover), and marked/hidden like search results.

### Other cards (home, channel pages)
- They only get the toggle button, at the top-left of the card and visible on hover. They're not outlined or hidden yet.

### Popup
- A title showing the count: "🚫 AI-Slop blacklist (N)".
- A checkbox, **"Show blacklisted channels"** (`showBlacklisted` in `chrome.storage.sync`, default `true`). Checked means blacklisted videos are marked. Unchecked means they're hidden.
- The list of blacklisted channels: each name links to the channel and has a ✕ button that removes it. The list updates live.

### Toolbar icon badge
- Shows the number of blacklisted videos on the current tab's search page or watch page sidebar, in either mode. White text on red. Empty when the count is 0.

## Current implementation (YouTube-specific, check these first if something breaks)

- **Files:** `block.js` + `block.css` (content script), `background.js` (sets the badge), `popup.html` / `popup.js`.
- **Cards:** `ytd-rich-item-renderer`, `ytd-video-renderer`, `ytd-compact-video-renderer`, `ytd-grid-video-renderer`, `yt-lockup-view-model`. A search result is `ytd-search ytd-video-renderer`. Nested cards are skipped.
- **Detecting a card's channel:** the card's own `/@handle` or `/channel/UC…` link. There's no network request when checking. Sidebar lockups (`ytd-watch-next-secondary-results-renderer yt-lockup-view-model`) have no channel link, so they fall back to matching the plain-text name in `yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText` against the stored `name`.
- **Sidebar thumbnail overlay:** lockups use `yt-thumbnail-view-model` instead of `ytd-thumbnail`.
- **Getting the `UC…` id when adding:** fetch `/watch?v=ID` and use regexes to read `videoDetails.channelId`, `author` and `ownerProfileUrl`. The page is about 1.4 MB, so only do this on click.
- **Button placement:** on search results it goes in `#channel-info`, because YouTube's hover-preview overlay covers anything on the thumbnail (raising the `z-index` doesn't help).
- **Thumbnail overlay:** a CSS `::after` on `ytd-thumbnail`. Don't swap the `<img>` src, because YouTube re-renders it.
- **Hide mode:** a `ytaib-hide-blacklisted` class on `<html>` with `.ytaib-blacklisted { display: none }`.
- **Badge:** the content script counts `.ytaib-blacklisted` inside `ytd-search:not([hidden])` and `ytd-watch-flexy:not([hidden])` and messages `background.js` only when the count changes. Content scripts can't call `chrome.action`.
- **Dynamic page:** a `MutationObserver` on the whole document reruns `scan()`. Only write to the DOM when a value actually changes, or the observer triggers itself in an endless loop.

## Working with the user

- Build in small steps, one feature per request, and let the user test in Chrome before moving on.
- Use 4-space indentation.
- After changes, tell the user to reload the extension and refresh the YouTube tab, because open tabs keep running the old content script.
- Only commit when asked. Don't delete code or files without asking.
