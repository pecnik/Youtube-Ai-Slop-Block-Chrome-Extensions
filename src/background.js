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

// AiSList (https://github.com/Override92/AiSList, CC BY-NC 4.0): a community list
// of AI-slop channel handles. We download it at most once an hour and keep the
// handles in chrome.storage.local, where block.js reads them into memory.
const AISLIST_URL = "https://raw.githubusercontent.com/Override92/AiSList/main/AiSList/aislist_blocklist.txt";
const AISLIST_MAX_AGE = 60 * 60 * 1000;

async function syncAisList({ force = false } = {}) {
    const { aislist } = await chrome.storage.local.get("aislist");
    if (!force && aislist && Date.now() - aislist.fetchedAt < AISLIST_MAX_AGE) return;

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
    } catch (err) {
        // Keep the old copy; the next alarm tries again.
        console.warn("[YT-AI-Block] AiSList sync failed:", err);
    }
}

chrome.alarms.create("aislist", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "aislist") syncAisList();
});
chrome.runtime.onInstalled.addListener(() => syncAisList({ force: true }));
chrome.runtime.onStartup.addListener(() => syncAisList());
