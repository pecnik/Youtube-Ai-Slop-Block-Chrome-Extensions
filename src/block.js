// Adds a "Blacklist Channel" button to each video card; clicking it toggles the
// video's channel on the blacklist.

const CARD_SELECTOR = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-grid-video-renderer",
    "yt-lockup-view-model",
].join(",");

let blacklist = []; // [{ id, name, handle, addedAt }]
let aislist = new Set(); // lowercased "@handle"s from AiSList, synced hourly by background.js

// When "Show blacklisted channels" is off, block.css hides blacklisted videos entirely.
function applyShowBlacklisted(show = true) {
    document.documentElement.classList.toggle("ytaib-hide-blacklisted", !show);
}

chrome.storage.sync.get(["blacklist", "showBlacklisted"]).then((data) => {
    blacklist = data.blacklist || [];
    applyShowBlacklisted(data.showBlacklisted);
    scan();
});
chrome.storage.local.get("aislist").then((data) => {
    aislist = new Set(data.aislist?.handles);
    scan();
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.showBlacklisted) applyShowBlacklisted(changes.showBlacklisted.newValue);
    if (changes.aislist) aislist = new Set(changes.aislist.newValue?.handles);
    if (changes.blacklist) blacklist = changes.blacklist.newValue || [];
    if (changes.aislist || changes.blacklist) scan();
});

// Cards don't always show the channel (e.g. on a channel's own page), but they
// always link to the video, so we can look the channel up from the watch page.
const channelCache = new Map(); // videoId -> { id, name, handle }

function getVideoId(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href^="/shorts/"]');
    if (!link) {
        return null;
    }

    const url = new URL(link.href);
    return url.searchParams.get("v") || url.pathname.split("/")[2];
}

async function getChannel(card) {
    const videoId = getVideoId(card);
    if (!videoId) {
        return null;
    }

    if (!channelCache.has(videoId)) {
        const html = await (await fetch(`/watch?v=${videoId}`)).text();
        const id = html.match(/"videoDetails":\{[^}]*?"channelId":"(UC[\w-]{22})"/)?.[1];
        const name = html.match(/"videoDetails":\{.*?"author":"((?:[^"\\]|\\.)*)"/)?.[1];
        const handle = html.match(/"ownerProfileUrl":"[^"]*\/(@[^"/]+)"/)?.[1];
        channelCache.set(
            videoId,
            id ? { id, name: name ? JSON.parse(`"${name}"`) : id, handle: handle ? decodeURIComponent(handle) : null } : null
        );
    }

    return channelCache.get(videoId);
}

// The channel as shown in the card's own links, if any: "@handle" or a "UC..." id.
function getCardChannelKey(card) {
    const link = card.querySelector('a[href^="/@"], a[href^="/channel/UC"]');
    if (!link) {
        return null;
    }

    const [first, second] = new URL(link.href).pathname.split("/").filter(Boolean);
    return first === "channel" ? second : decodeURIComponent(first);
}

// The channel name shown as plain text, for cards with no channel link (e.g. the
// watch page sidebar, where the name is a <span> and the avatar has no href).
function getCardChannelName(card) {
    return card.querySelector("yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText")?.textContent.trim() || null;
}

function findInBlacklist(key) {
    const lower = key.toLowerCase();
    return blacklist.find((c) => c.id === key || c.handle?.toLowerCase() === lower);
}

// The blacklist entry for the card's channel, judged only by what the card shows:
// its channel link if it has one, otherwise the channel name.
function findCardEntry(card) {
    const key = getCardChannelKey(card);
    if (key) return findInBlacklist(key);

    const name = getCardChannelName(card);
    return name ? blacklist.find((c) => c.name === name) : undefined;

    // Disabled for now: fall back to downloading the watch page when the card has no channel link.
    // // A card link is only conclusive if every entry has a handle to compare against.
    // if (key && blacklist.every((c) => c.handle)) {
    //     return false;
    // }
    //
    // const channel = await getChannel(card);
    // if (!channel) {
    //     return false;
    // }
    //
    // const entry = findInBlacklist(channel.id);
    // if (entry && !entry.handle && channel.handle) {
    //     // Entries saved before we stored handles: fill it in so future checks are instant.
    //     await updateBlacklistEntry(channel.id, { handle: channel.handle });
    // }
    //
    // return Boolean(entry);
}

function isInAisList(card) {
    return aislist.has(getCardChannelKey(card)?.toLowerCase());
}

async function addToBlacklist(channel) {
    const { blacklist = [] } = await chrome.storage.sync.get("blacklist");
    if (!blacklist.some((c) => c.id === channel.id)) {
        blacklist.push({ ...channel, addedAt: Date.now() });
        await chrome.storage.sync.set({ blacklist });
    }
}

async function removeFromBlacklist(id) {
    const { blacklist = [] } = await chrome.storage.sync.get("blacklist");
    await chrome.storage.sync.set({ blacklist: blacklist.filter((c) => c.id !== id) });
}

async function updateBlacklistEntry(id, changes) {
    const { blacklist = [] } = await chrome.storage.sync.get("blacklist");
    await chrome.storage.sync.set({ blacklist: blacklist.map((c) => (c.id === id ? { ...c, ...changes } : c)) });
}

function setButtonState(btn, state) {
    // scan() calls this on every DOM change, and writing the text is itself a DOM
    // change, so only touch the button when the state actually changes.
    if (btn.dataset.state === state) return;
    btn.dataset.state = state;
    btn.textContent = { idle: "Blacklist Channel", loading: "…", blacklisted: "Blacklisted", aislist: "AiSList" }[state];
}

// Our own blacklist wins over AiSList, so the button can still remove the channel.
function getCardState(card) {
    if (findCardEntry(card)) return "blacklisted";
    if (isInAisList(card)) return "aislist";
    return "idle";
}

async function toggleBlacklist(card) {
    const entry = findCardEntry(card);
    if (entry) {
        await removeFromBlacklist(entry.id);
        console.log("[YT-AI-Block] removed from blacklist:", entry);
        return;
    }

    const channel = await getChannel(card);
    if (!channel) {
        console.warn("[YT-AI-Block] couldn't find the channel for", card);
        return;
    }

    // The card may have no channel link, so check again by id before adding.
    if (findInBlacklist(channel.id)) {
        await removeFromBlacklist(channel.id);
        console.log("[YT-AI-Block] removed from blacklist:", channel);
    } else {
        await addToBlacklist(channel);
        console.log("[YT-AI-Block] blacklisted:", channel);
    }
}

function addButton(card) {
    if (card.querySelector(".ytaib-btn")) return;

    // On search results the hover preview covers the thumbnail, so put the button
    // next to the channel name instead. That row may not be rendered yet; the next
    // scan() will try again.
    const isSearchResult = card.matches("ytd-search ytd-video-renderer");
    const container = isSearchResult ? card.querySelector("#channel-info") : card;
    if (!container) return;

    const btn = document.createElement("button");
    btn.className = isSearchResult ? "ytaib-btn ytaib-btn--inline" : "ytaib-btn";

    btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.state === "loading") return;
        // AiSList channels can't be removed from here; that's their list, not ours.
        if (btn.dataset.state === "aislist") return;

        setButtonState(btn, "loading");
        await toggleBlacklist(card);
        setButtonState(btn, getCardState(card));
    });

    container.appendChild(btn);
}

// Cards that get marked or hidden when blacklisted: search results and the watch page sidebar.
const MARKED_CARD_SELECTOR = [
    "ytd-search ytd-video-renderer",
    "ytd-watch-next-secondary-results-renderer yt-lockup-view-model",
    "ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer",
].join(",");

// Syncs the button label, and the red outline on marked cards, with the blacklist.
function updateCard(card) {
    const state = getCardState(card);
    const btn = card.querySelector(".ytaib-btn");
    if (btn && btn.dataset.state !== "loading") setButtonState(btn, state);
    if (card.matches(MARKED_CARD_SELECTOR)) card.classList.toggle("ytaib-blacklisted", state !== "idle");
}

// Tells background.js how many blacklisted videos this page has, for the icon badge.
let lastCount = null;
function updateBadge() {
    // YouTube keeps visited pages in the DOM (hidden) after you navigate away.
    const count = document.querySelectorAll(
        "ytd-search:not([hidden]) .ytaib-blacklisted, ytd-watch-flexy:not([hidden]) .ytaib-blacklisted"
    ).length;
    if (count === lastCount) return;
    lastCount = count;
    chrome.runtime.sendMessage({ type: "blacklistedCount", count }).catch(() => {});
}

function scan() {
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
        // Skip cards nested inside another card (e.g. lockup inside rich-item).
        if (card.parentElement?.closest(CARD_SELECTOR)) return;
        addButton(card);
        updateCard(card);
    });
    updateBadge();
}

// YouTube loads cards dynamically, so rescan whenever the page changes.
new MutationObserver(scan).observe(document.documentElement, {
    childList: true,
    subtree: true,
});

scan();
