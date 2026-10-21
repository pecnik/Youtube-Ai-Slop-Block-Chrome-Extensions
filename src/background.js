// Content scripts can't touch the toolbar icon, so block.js sends us the number
// of blacklisted videos on its page and we show it as the tab's badge.

chrome.action.setBadgeBackgroundColor({ color: "#f00" });
chrome.action.setBadgeTextColor({ color: "#fff" });

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type !== "blacklistedCount" || !sender.tab) return;
    chrome.action.setBadgeText({
        tabId: sender.tab.id,
        text: message.count ? String(message.count) : "",
    });
});

// Unique video ids blocked today, for the popup. Several tabs report at once, so
// queue the read-modify-write steps or they'd overwrite each other.
let blockedQueue = Promise.resolve();

async function addBlocked(videoIds) {
    const today = new Date().toLocaleDateString("sv"); // "2026-10-21", local time
    const { blockedToday } = await chrome.storage.local.get("blockedToday");
    const ids = new Set(blockedToday?.date === today ? blockedToday.videoIds : []);
    const before = ids.size;
    videoIds.forEach((id) => ids.add(id));
    if (ids.size === before) return;
    await chrome.storage.local.set({ blockedToday: { date: today, videoIds: [...ids] } });
}

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message.type !== "blocked") return;
    blockedQueue = blockedQueue.then(() => addBlocked(message.videoIds)).catch(console.warn);
});

// AiSList (https://github.com/Override92/AiSList, CC BY-NC 4.0): a community list
// of AI-slop channel handles. We download it at most once an hour and keep the
// handles in chrome.storage.local, where block.js reads them into memory.
const AISLIST_URL = "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt";
const AISLIST_MAX_AGE = 60 * 60 * 1000;

// Resolves to true if the list is fresh (downloaded now or recently enough), false if the download failed.
async function syncAisList({ force = false } = {}) {
    const { aislist } = await chrome.storage.local.get("aislist");
    if (!force && aislist && Date.now() - aislist.fetchedAt < AISLIST_MAX_AGE) return true;

    try {
        const res = await fetch(AISLIST_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // One entry per line: "@handle" or "UC..." id. Lines starting with "!" are comments.
        const handles = (await res.text())
            .split("\n")
            .map((line) => line.trim().toLowerCase())
            .filter((line) => line && !line.startsWith("!"));
        await chrome.storage.local.set({ aislist: { handles, fetchedAt: Date.now() } });
        console.log(`[YT-AI-Block] AiSList synced: ${handles.length} channels`);
        return true;
    } catch (err) {
        // Keep the old copy; the next alarm tries again.
        console.warn("[YT-AI-Block] AiSList sync failed:", err);
        return false;
    }
}

// The popup's "Sync AiSList" button. Returning true keeps sendResponse open for the async reply.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "syncAisList") return;
    syncAisList({ force: true }).then((ok) => sendResponse({ ok }));
    return true;
});

chrome.alarms.create("aislist", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "aislist") syncAisList();
});
chrome.runtime.onInstalled.addListener(() => syncAisList({ force: true }));
chrome.runtime.onStartup.addListener(() => syncAisList());
