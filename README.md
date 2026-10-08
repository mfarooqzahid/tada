# Tada — a minimal todo list

A small, light, dependency-free Chrome extension (Manifest V3). One straight
list of todos, an expandable history of what you've completed, and a keyboard-
first capture flow that works on any page.

> No build step. No npm install. Load it unpacked and go.

## What it looks like

- **Dashboard** — a single centered column: a big **New task** row at the top, a
  plain list of open todos, and a collapsible **Completed** section underneath.
  No sidebar, no clutter. Light by default.
- **New tab** — Tada replaces Chrome's New Tab page, so opening a fresh tab
  lands straight on your todo list.
- **Every page** — press **Ctrl+N** (Cmd+N on Mac) to open a centered quick-list
  overlay. There is no button pinned to the corner; nothing takes over the page.

## Features

**Capture**
- Press **Ctrl+N** on any page for a centered overlay with the new-task box
  already focused. Add several tasks without leaving the page.
- Prominent **New task** button at the top of the dashboard (keyboard and screen
  reader friendly).
- Right-click any page → **Add selection to Tada** / **Add this page to Tada**.
- Toolbar popup for quick capture from anywhere.

**Organise (without the clutter)**
- Expand any task to add **notes**, a **due date**, and **subtasks**.
- Completed tasks move to the expandable **Completed** section, which shows when
  each was finished and lets you reopen them with one click.
- Task order can be left as-is; the list is simply top-to-bottom.

**Safe**
- Deleting shows an **Undo** toast.
- Deleted tasks are kept in a trash (auto-purged after 30 days) so undo works.
- Every change is written to an internal activity log with restorable snapshots.

**Settings (built into the app)**
- Open settings from the gear in the header — it renders in the same page and
  matches the app's theme, no separate tab.
- Light / dark / system theme (light by default), toolbar badge, hidden sites,
  confirm-before-delete and trash retention.
- JSON export & import, reset, and a storage-usage readout.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome or any Chromium browser.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and pick this folder (`tada/`).
4. Pin the Tada icon, then on any website press **Ctrl+N**.

### New Tab page

Tada overrides Chrome's New Tab page (`chrome_url_overrides.newtab`), so every
new tab shows your todo list. To stop this, disable Tada on `chrome://extensions`
or remove the `chrome_url_overrides` block from `manifest.json` and reload.
(The **home button** is a browser setting, not something an extension can force —
set it under Chrome → Settings → *On startup* / *Appearance* if you want that too.)

## Keyboard

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` / `Cmd+N` | Open the quick-list overlay on the current page (best effort — see note) |
| `Ctrl+Shift+Y` | Open/close the overlay (extension command) |
| `Ctrl+Shift+U` | Open the overlay with a new task started |
| `Enter` | Add the task / confirm an inline edit |
| `Esc` | Close the overlay / cancel editing |
| `/` (dashboard) | Focus search |

> Chrome reserves `Ctrl+N` at the browser level, so on some setups it may still
> open a new window. The toolbar popup and `Ctrl+Shift+Y` always work. Reassign
> shortcuts at `chrome://extensions/shortcuts`.

## Project layout

```
manifest.json                     MV3 manifest
icons/                            generated PNG icons
src/
  shared/
    common.js                     constants + utilities (dates, sorting, search)
    store.js                      state shape, reducers, activity log, UI API
    miniview.js                   the shared minimal list UI (used by both
                                  the dashboard and the on-page overlay)
  background/
    service-worker.js             single writer, badge, context menus, alarms
  content/
    content.js                    on-page Ctrl+N overlay (Shadow DOM)
  popup/                          toolbar popup (html/css/js)
  dashboard/                      minimal single-column dashboard (html/css/js)
  options/                      entry point → opens the in-app settings view
```

### Architecture notes

- **One UI, two places.** `src/shared/miniview.js` renders the new-task box, the
  open list and the expandable completed list. The dashboard and the on-page
  overlay both mount it, so they behave identically.
- **Single writer.** All mutations are sent to the service worker, which applies
  them through a serialised queue (`Tada.store.applyAction`) and writes the whole
  state to `chrome.storage.local`. This avoids lost-update races.
- **Live sync.** Every surface subscribes to `chrome.storage.onChanged`, so a
  change made anywhere updates everywhere instantly — including the toolbar
  badge and the dashboard tab title.
- **Isolated overlay.** The on-page overlay lives in a Shadow DOM and uses a
  constructed stylesheet, so page CSS and CSP can't affect it.

### Data model (abridged)

```js
{
  version, createdAt,
  todos: [{ id, title, notes, completed, completedAt, priority, listId, tags,
            dueDate, subtasks: [{id,title,done}], createdAt, updatedAt,
            deletedAt, order, sourceUrl, sourceTitle }],
  lists: [{ id, name, color, createdAt }],
  history: [{ id, at, action, todoId, summary, changes?, snapshot? }],
  settings: { theme, widgetEnabled, mutedSites, confirmDelete, quickAddPriority,
              defaultListId, autoPurgeTrashDays, badgeEnabled }
}
```

Priority, lists and tags remain in the data model (and in the popup) even though
the minimal dashboard doesn't surface them, so nothing is lost if you used an
earlier build.

## Development

There is no build step — edit files and hit **Reload** on `chrome://extensions`.

The data layer is pure JS and unit-testable in Node with a `chrome.storage` mock;
the UI runs in any browser thanks to a small `chrome.*` shim used only by the
test harness. Nothing in `src/` depends on the harness.
