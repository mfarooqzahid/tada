/*!
 * Tada — background service worker (Manifest V3).
 *
 * Responsibilities:
 *   - The single writer for the shared state (serialised mutation queue).
 *   - Answers read/mutate requests from content scripts, popup and dashboard.
 *   - Keeps the toolbar badge in sync with the active task count.
 *   - Registers context-menu quick-add entries.
 *   - Runs the daily trash auto-purge alarm.
 *   - Handles the keyboard command(s).
 */
importScripts("../shared/common.js", "../shared/store.js");

const T = self.Tada;

/* ----------------------------------------------------------------------- *
 * Serialised mutation queue — prevents lost updates from interleaved writes.
 * ----------------------------------------------------------------------- */

let queue = Promise.resolve();

function run(task) {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

/* ----------------------------------------------------------------------- *
 * Badge
 * ----------------------------------------------------------------------- */

async function updateBadge(state) {
  try {
    if (!state) state = await T.store.load();
    if (!state.settings.badgeEnabled) {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }
    const active = T.util.countActive(state.todos);
    await chrome.action.setBadgeText({ text: active ? String(active) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#6c8cff" });
  } catch (err) {
    // Tab may have closed; ignore.
  }
}

/* ----------------------------------------------------------------------- *
 * Message handling
 * ----------------------------------------------------------------------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== "object" || typeof msg.type !== "string" || !msg.type.startsWith("tada:")) {
    return undefined;
  }

  if (msg.type === "tada:get") {
    run(() => T.store.load())
      .then(sendResponse)
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }

  if (msg.type === "tada:action") {
    run(async () => {
      const state = await T.store.load();
      const entry = T.store.applyAction(state, msg.action, msg.payload || {}, sender);
      if (entry) T.store.pushHistory(state, entry);
      await T.store.save(state);
      return state;
    })
      .then((state) => {
        updateBadge(state);
        sendResponse({ ok: true, state });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return undefined;
});

/* ----------------------------------------------------------------------- *
 * Context menus
 * ----------------------------------------------------------------------- */

const MENU = { selection: "tada-add-selection", page: "tada-add-page" };

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU.selection,
      title: 'Add “%s” to Tada',
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU.page,
      title: "Add this page to Tada",
      contexts: ["page"],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  let title = "";
  if (info.menuItemId === MENU.selection) {
    title = (info.selectionText || "").trim();
  } else if (info.menuItemId === MENU.page) {
    title = (tab && tab.title) || (info.pageUrl || "");
  }
  if (!title) return;
  dispatchFromBackground("todo:add", {
    title: T.util.truncate(title.replace(/\s+/g, " "), 500),
    sourceUrl: info.pageUrl || (tab && tab.url) || null,
    sourceTitle: (tab && tab.title) || null,
  });
});

function dispatchFromBackground(action, payload) {
  return run(async () => {
    const state = await T.store.load();
    const entry = T.store.applyAction(state, action, payload, null);
    if (entry) T.store.pushHistory(state, entry);
    await T.store.save(state);
    updateBadge(state);
    return state;
  });
}

/* ----------------------------------------------------------------------- *
 * Commands (keyboard shortcuts)
 * ----------------------------------------------------------------------- */

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  if (command === "toggle-widget") {
    chrome.tabs.sendMessage(tab.id, { type: "tada:toggle-widget" }).catch(() => {});
  } else if (command === "quick-add") {
    chrome.tabs.sendMessage(tab.id, { type: "tada:quick-add" }).catch(() => {});
  }
});

/* ----------------------------------------------------------------------- *
 * Lifecycle
 * ----------------------------------------------------------------------- */

chrome.runtime.onInstalled.addListener(async (details) => {
  createMenus();
  await run(async () => {
    const existing = await chrome.storage.local.get(T.store.KEY);
    if (!existing[T.store.KEY]) {
      await T.store.save(T.store.defaultState());
    }
    return T.store.load();
  }).then(updateBadge);

  // Open the app on first install.
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  createMenus();
  updateBadge();
});

/* Daily trash auto-purge. */
const PURGE_ALARM = "tada:purge-trash";

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== PURGE_ALARM) return;
  run(async () => {
    const state = await T.store.load();
    const entry = T.store.applyAction(state, "trash:purge-expired", {});
    if (entry) {
      T.store.pushHistory(state, entry);
      await T.store.save(state);
      updateBadge(state);
    }
    return state;
  });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(PURGE_ALARM, { periodInMinutes: 60 * 12 });
});

/* Keep the badge honest even if state changes from another writer context. */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[T.store.KEY]) {
    updateBadge(changes[T.store.KEY].newValue);
  }
});

// Kick things off for the current session.
updateBadge();
