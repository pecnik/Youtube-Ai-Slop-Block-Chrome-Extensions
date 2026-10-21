const list = document.getElementById("list");
const count = document.getElementById("count");
const showBlacklisted = document.getElementById("show-blacklisted");

// Defaults to on, which keeps the outline and overlay; off hides blacklisted videos.
chrome.storage.sync.get("showBlacklisted").then(({ showBlacklisted: show = true }) => {
    showBlacklisted.checked = show;
});
showBlacklisted.onchange = () => chrome.storage.sync.set({ showBlacklisted: showBlacklisted.checked });

const blockedToday = document.getElementById("blocked-today");

async function renderBlockedToday() {
    const today = new Date().toLocaleDateString("sv"); // same format as background.js
    const { blockedToday: data } = await chrome.storage.local.get("blockedToday");
    const n = data?.date === today ? data.videoIds.length : 0;
    blockedToday.textContent = n === 1 ? "1 video" : `${n} videos`;
}
chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockedToday) renderBlockedToday();
});
renderBlockedToday();

const aislistStatus =document.getElementById("aislist-status");
const syncAislist = document.getElementById("sync-aislist");

function timeAgo(time) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)} h ago`;
}

async function renderAisList() {
    const { aislist } = await chrome.storage.local.get("aislist");
    aislistStatus.textContent = aislist
        ? `AiSList: ${aislist.handles.length} channels\nsynced ${timeAgo(aislist.fetchedAt)}`
        : "AiSList: not synced yet";
}

// background.js does the download, so it keeps working if the popup closes mid-sync.
syncAislist.onclick = async () => {
    syncAislist.disabled = true;
    syncAislist.textContent = "Syncing…";
    const { ok } = await chrome.runtime.sendMessage({ type: "syncAisList" });
    syncAislist.disabled = false;
    syncAislist.textContent = ok ? "Sync AiSList" : "Failed, retry";
    renderAisList();
};
renderAisList();

async function render() {
    const { blacklist = [] } = await chrome.storage.sync.get("blacklist");
    count.textContent = blacklist.length;
    list.replaceChildren();

    if (!blacklist.length) {
        list.innerHTML = '<li class="empty">No channels yet — click "Blacklist Channel" on a video.</li>';
        return;
    }

    for (const channel of blacklist) {
        const li = document.createElement("li");

        const link = document.createElement("a");
        link.href = `https://www.youtube.com/channel/${channel.id}`;
        link.target = "_blank";
        link.textContent = channel.name;
        link.title = channel.id;

        const remove = document.createElement("button");
        remove.textContent = "✕";
        remove.title = "Remove from blacklist";
        remove.onclick = async () => {
            const { blacklist = [] } = await chrome.storage.sync.get("blacklist");
            await chrome.storage.sync.set({ blacklist: blacklist.filter((c) => c.id !== channel.id) });
        };

        li.append(link, remove);
        list.append(li);
    }
}

// Re-render on any change, including channels added from a YouTube tab while the popup is open.
chrome.storage.onChanged.addListener(render);
render();
