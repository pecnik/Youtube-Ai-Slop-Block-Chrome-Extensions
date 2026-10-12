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
