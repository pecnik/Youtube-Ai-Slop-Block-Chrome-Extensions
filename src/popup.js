const list = document.getElementById("list");
const count = document.getElementById("count");
const showBlacklisted = document.getElementById("show-blacklisted");

// Defaults to on, which keeps the outline and overlay; off hides blacklisted videos.
chrome.storage.sync.get("showBlacklisted").then(({ showBlacklisted: show = true }) => {
    showBlacklisted.checked = show;
});
showBlacklisted.onchange = () => chrome.storage.sync.set({ showBlacklisted: showBlacklisted.checked });

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
