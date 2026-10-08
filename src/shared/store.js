/*!
 * Tada — data layer.
 *
 * The service worker is the single writer. All mutations flow through
 * `Tada.store.applyAction()`. Every mutation that matters records an entry in
 * the activity log (state.history) so the user can review and undo history.
 *
 * UI contexts (content script, popup, dashboard, options) read state directly
 * from chrome.storage and subscribe to changes via `Tada.api`.
 */
(function () {
  "use strict";

  const Tada = (globalThis.Tada = globalThis.Tada || {});
  const { uid, now } = Tada.util;

  const KEY = Tada.STORAGE_KEY;
  const HISTORY_LIMIT = Tada.HISTORY_LIMIT;

  /* --------------------------------------------------------------------- *
   * State shape + migration
   * --------------------------------------------------------------------- */

  function defaultState() {
    const ts = now();
    return {
      version: 1,
      createdAt: ts,
      todos: [],
      lists: [{ id: "inbox", name: "Inbox", color: "#6c8cff", createdAt: ts }],
      history: [],
      settings: {
        theme: "light",
        widgetEnabled: true,
        mutedSites: [],
        fabPosition: null, // { right, bottom } in px
        confirmDelete: false,
        quickAddPriority: "none",
        defaultListId: "inbox",
        dashboardNewTab: true,
        autoPurgeTrashDays: Tada.TRASH_RETENTION_DAYS,
        badgeEnabled: true,
        completedCollapsed: true,
      },
    };
  }

  function migrate(state) {
    const base = defaultState();
    const next = Object.assign({}, base, state || {});
    next.settings = Object.assign({}, base.settings, (state && state.settings) || {});
    next.todos = Array.isArray(next.todos) ? next.todos : [];
    next.lists = Array.isArray(next.lists) && next.lists.length ? next.lists : base.lists;
    next.history = Array.isArray(next.history) ? next.history : [];
    next.version = 1;
    // Normalise every todo a little so the UI can assume the shape.
    next.todos.forEach((t) => {
      if (!t.id) t.id = uid();
      if (!t.priority) t.priority = "none";
      if (!Array.isArray(t.tags)) t.tags = [];
      if (!Array.isArray(t.subtasks)) t.subtasks = [];
      if (typeof t.notes !== "string") t.notes = "";
      if (typeof t.order !== "number") t.order = t.createdAt || now();
      if (!t.listId) t.listId = "inbox";
      if (typeof t.completed !== "boolean") t.completed = false;
    });
    return next;
  }

  /* --------------------------------------------------------------------- *
   * Persistence
   * --------------------------------------------------------------------- */

  async function load() {
    const obj = await chrome.storage.local.get(KEY);
    return migrate(obj[KEY]);
  }

  async function save(state) {
    await chrome.storage.local.set({ [KEY]: state });
    return state;
  }

  /* --------------------------------------------------------------------- *
   * Activity log
   * --------------------------------------------------------------------- */

  function pushHistory(state, entry) {
    const record = Object.assign({ id: uid(), at: now() }, entry);
    state.history.unshift(record);
    if (state.history.length > HISTORY_LIMIT) {
      state.history.length = HISTORY_LIMIT;
    }
    return record;
  }

  /* --------------------------------------------------------------------- *
   * Helpers
   * --------------------------------------------------------------------- */

  function findTodo(state, id) {
    return state.todos.find((t) => t.id === id) || null;
  }

  function findList(state, id) {
    return state.lists.find((l) => l.id === id) || null;
  }

  function nextOrder(state) {
    return state.todos.reduce((max, t) => Math.max(max, t.order || 0), 0) + 1;
  }

  function listName(state, id) {
    const l = findList(state, id);
    return l ? l.name : "Inbox";
  }

  function describeChanges(changes) {
    return changes
      .map((c) => {
        const from = c.from == null || c.from === "" ? "—" : c.from;
        const to = c.to == null || c.to === "" ? "—" : c.to;
        return `${c.field}: ${from} → ${to}`;
      })
      .join(", ");
  }

  function diffPatch(todo, patch) {
    const changes = [];
    Object.keys(patch).forEach((field) => {
      const before = todo[field];
      const after = patch[field];
      const same = JSON.stringify(before) === JSON.stringify(after);
      if (!same) changes.push({ field, from: before, to: after });
    });
    return changes;
  }

  function sanitizeTitle(title) {
    return String(title == null ? "" : title).replace(/\s+/g, " ").trim().slice(0, 500);
  }

  /* --------------------------------------------------------------------- *
   * Reducers — each returns a history entry (or null) and mutates `state`.
   * --------------------------------------------------------------------- */

  function actionAdd(state, payload, sender) {
    const title = sanitizeTitle(payload.title);
    if (!title) return null;
    const ts = now();
    const listId = payload.listId && findList(state, payload.listId) ? payload.listId : state.settings.defaultListId;
    const todo = {
      id: uid(),
      title,
      notes: typeof payload.notes === "string" ? payload.notes : "",
      completed: false,
      priority: Tada.PRIORITIES.includes(payload.priority) ? payload.priority : "none",
      listId,
      tags: Array.isArray(payload.tags) ? payload.tags.slice(0, 20) : [],
      dueDate: payload.dueDate || null,
      subtasks: Array.isArray(payload.subtasks) ? payload.subtasks : [],
      createdAt: ts,
      updatedAt: ts,
      completedAt: null,
      deletedAt: null,
      order: nextOrder(state),
      sourceUrl: payload.sourceUrl || (sender && sender.tab ? sender.tab.url : null) || null,
      sourceTitle: payload.sourceTitle || (sender && sender.tab ? sender.tab.title : null) || null,
    };
    state.todos.push(todo);
    return {
      action: "todo:add",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `added “${todo.title}” to ${listName(state, todo.listId)}`,
    };
  }

  function actionUpdate(state, payload) {
    const todo = findTodo(state, payload.id);
    if (!todo) return null;
    const patch = Object.assign({}, payload.patch);
    if (typeof patch.title === "string") {
      patch.title = sanitizeTitle(patch.title);
      if (!patch.title) delete patch.title;
    }
    if (patch.listId && !findList(state, patch.listId)) delete patch.listId;
    const changes = diffPatch(todo, patch);
    if (!changes.length) return null;
    const before = {};
    changes.forEach((c) => (before[c.field] = c.from));
    Object.assign(todo, patch, { updatedAt: now() });
    return {
      action: "todo:update",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `edited “${todo.title}” (${describeChanges(changes.slice(0, 4))})`,
      changes,
      before,
      changes_count: changes.length,
    };
  }

  function actionComplete(state, payload) {
    const todo = findTodo(state, payload.id);
    if (!todo || todo.completed) return null;
    todo.completed = true;
    todo.completedAt = now();
    todo.updatedAt = todo.completedAt;
    const { done, total } = Tada.util.subtaskProgress(todo);
    return {
      action: "todo:complete",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `completed “${todo.title}”${total ? ` (${done}/${total} subtasks)` : ""}`,
    };
  }

  function actionUncomplete(state, payload) {
    const todo = findTodo(state, payload.id);
    if (!todo || !todo.completed) return null;
    todo.completed = false;
    todo.completedAt = null;
    todo.updatedAt = now();
    return { action: "todo:uncomplete", todoId: todo.id, todoTitle: todo.title, summary: `reopened “${todo.title}”` };
  }

  function actionDelete(state, payload) {
    const todo = findTodo(state, payload.id);
    if (!todo) return null;
    todo.deletedAt = now();
    todo.updatedAt = todo.deletedAt;
    return {
      action: "todo:delete",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `moved “${todo.title}” to trash`,
      snapshot: JSON.parse(JSON.stringify(todo)),
    };
  }

  function actionRestore(state, payload) {
    const todo = findTodo(state, payload.id);
    if (!todo || !todo.deletedAt) return null;
    todo.deletedAt = null;
    todo.updatedAt = now();
    return { action: "todo:restore", todoId: todo.id, todoTitle: todo.title, summary: `restored “${todo.title}”` };
  }

  function actionPurge(state, payload) {
    const idx = state.todos.findIndex((t) => t.id === payload.id);
    if (idx === -1) return null;
    const todo = state.todos[idx];
    const snapshot = JSON.parse(JSON.stringify(todo));
    state.todos.splice(idx, 1);
    return {
      action: "todo:purge",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `deleted “${todo.title}” permanently`,
      snapshot,
    };
  }

  function actionReorder(state, payload) {
    const ids = payload.ids || [];
    ids.forEach((id, index) => {
      const todo = findTodo(state, id);
      if (todo) todo.order = index + 1;
    });
    return { action: "todo:reorder", summary: `reordered ${ids.length} task${ids.length === 1 ? "" : "s"}` };
  }

  function actionClearCompleted(state) {
    const completed = state.todos.filter((t) => t.completed && !t.deletedAt);
    if (!completed.length) return null;
    const ts = now();
    completed.forEach((t) => {
      t.deletedAt = ts;
    });
    return {
      action: "todo:clear-completed",
      summary: `moved ${completed.length} completed task${completed.length === 1 ? "" : "s"} to trash`,
      snapshot: completed.map((t) => JSON.parse(JSON.stringify(t))),
    };
  }

  function actionSubtaskAdd(state, payload) {
    const todo = findTodo(state, payload.todoId);
    if (!todo) return null;
    const title = sanitizeTitle(payload.title);
    if (!title) return null;
    const sub = { id: uid(), title, done: false };
    todo.subtasks.push(sub);
    todo.updatedAt = now();
    return {
      action: "subtask:add",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `added subtask “${title}”`,
    };
  }

  function actionSubtaskUpdate(state, payload) {
    const todo = findTodo(state, payload.todoId);
    if (!todo) return null;
    const sub = todo.subtasks.find((s) => s.id === payload.subtaskId);
    if (!sub) return null;
    const patch = payload.patch || {};
    if (typeof patch.title === "string") {
      const t = sanitizeTitle(patch.title);
      if (t) sub.title = t;
    }
    if (typeof patch.done === "boolean") sub.done = patch.done;
    todo.updatedAt = now();
    return {
      action: "subtask:update",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `updated subtask “${sub.title}”`,
    };
  }

  function actionSubtaskDelete(state, payload) {
    const todo = findTodo(state, payload.todoId);
    if (!todo) return null;
    const idx = todo.subtasks.findIndex((s) => s.id === payload.subtaskId);
    if (idx === -1) return null;
    const [removed] = todo.subtasks.splice(idx, 1);
    todo.updatedAt = now();
    return {
      action: "subtask:delete",
      todoId: todo.id,
      todoTitle: todo.title,
      summary: `removed subtask “${removed.title}”`,
    };
  }

  function actionListAdd(state, payload) {
    const name = sanitizeTitle(payload.name) || "Untitled list";
    const list = {
      id: uid(),
      name,
      color: payload.color || "#6c8cff",
      createdAt: now(),
    };
    state.lists.push(list);
    return { action: "list:add", summary: `created list “${name}”`, snapshot: list };
  }

  function actionListUpdate(state, payload) {
    const list = findList(state, payload.id);
    if (!list) return null;
    const patch = {};
    if (typeof payload.name === "string") patch.name = sanitizeTitle(payload.name) || list.name;
    if (typeof payload.color === "string") patch.color = payload.color;
    const changes = diffPatch(list, patch);
    if (!changes.length) return null;
    Object.assign(list, patch);
    return { action: "list:update", summary: `updated list “${list.name}”`, changes };
  }

  function actionListDelete(state, payload) {
    if (state.lists.length <= 1) return null;
    const idx = state.lists.findIndex((l) => l.id === payload.id);
    if (idx === -1) return null;
    const [removed] = state.lists.splice(idx, 1);
    const fallback = state.lists[0].id;
    let moved = 0;
    state.todos.forEach((t) => {
      if (t.listId === removed.id) {
        t.listId = fallback;
        moved++;
      }
    });
    if (state.settings.defaultListId === removed.id) state.settings.defaultListId = fallback;
    return {
      action: "list:delete",
      summary: `deleted list “${removed.name}” and moved ${moved} task${moved === 1 ? "" : "s"}`,
    };
  }

  function actionSettingsUpdate(state, payload) {
    const patch = payload.patch || {};
    const changes = diffPatch(state.settings, patch);
    if (!changes.length) return null;
    Object.assign(state.settings, patch);
    return {
      action: "settings:update",
      summary: `changed ${changes.map((c) => c.field).join(", ")}`,
      changes,
      silent: !!payload.silent,
    };
  }

  function actionHistoryClear(state) {
    const count = state.history.length;
    state.history = [];
    return { action: "history:clear", summary: `cleared ${count} history entr${count === 1 ? "y" : "ies"}` };
  }

  function actionImport(state, payload) {
    const incoming = payload.state || {};
    const merged = migrate(incoming);
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, merged);
    return { action: "state:import", summary: `imported ${state.todos.length} tasks and ${state.history.length} history entries` };
  }

  function actionReset(state) {
    const fresh = defaultState();
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, fresh);
    return { action: "state:reset", summary: "reset all data" };
  }

  function actionPurgeExpired(state, payload) {
    const days = payload && typeof payload.days === "number" ? payload.days : state.settings.autoPurgeTrashDays;
    if (!days || days <= 0) return null;
    const cutoff = now() - days * 86400000;
    const expired = state.todos.filter((t) => t.deletedAt && t.deletedAt < cutoff);
    if (!expired.length) return null;
    const ids = new Set(expired.map((t) => t.id));
    state.todos = state.todos.filter((t) => !ids.has(t.id));
    return {
      action: "trash:purge-expired",
      summary: `auto-purged ${expired.length} task${expired.length === 1 ? "" : "s"} older than ${days} days`,
    };
  }

  const REDUCERS = {
    "todo:add": actionAdd,
    "todo:update": actionUpdate,
    "todo:complete": actionComplete,
    "todo:uncomplete": actionUncomplete,
    "todo:delete": actionDelete,
    "todo:restore": actionRestore,
    "todo:purge": actionPurge,
    "todo:reorder": actionReorder,
    "todo:clear-completed": actionClearCompleted,
    "subtask:add": actionSubtaskAdd,
    "subtask:update": actionSubtaskUpdate,
    "subtask:delete": actionSubtaskDelete,
    "list:add": actionListAdd,
    "list:update": actionListUpdate,
    "list:delete": actionListDelete,
    "settings:update": actionSettingsUpdate,
    "history:clear": actionHistoryClear,
    "state:import": actionImport,
    "state:reset": actionReset,
    "trash:purge-expired": actionPurgeExpired,
  };

  /**
   * Apply an action to the given state. Returns the history entry that should be
   * recorded, or null when nothing changed.
   */
  function applyAction(state, action, payload, sender) {
    const reducer = REDUCERS[action];
    if (!reducer) throw new Error("Unknown action: " + action);
    const entry = reducer(state, payload || {}, sender);
    if (!entry) return null;
    // Silent entries still mutate state, but are never written to the log.
    if (entry.silent) return null;
    // Only destructive actions keep a restorable snapshot in the log.
    if (action !== "todo:delete" && action !== "todo:purge" && action !== "todo:clear-completed") {
      delete entry.snapshot;
    }
    return entry;
  }

  Tada.store = {
    KEY,
    defaultState,
    migrate,
    load,
    save,
    pushHistory,
    findTodo,
    findList,
    applyAction,
    REDUCERS,
    actions: Object.keys(REDUCERS),
  };

  /* --------------------------------------------------------------------- *
   * UI-facing API
   * --------------------------------------------------------------------- */

  Tada.api = {
    /** Fetch the full state from the service worker. */
    getState() {
      return chrome.runtime.sendMessage({ type: "tada:get" });
    },

    /** Dispatch a mutation. Resolves with the new state. */
    dispatch(action, payload) {
      return chrome.runtime.sendMessage({ type: "tada:action", action, payload: payload || {} });
    },

    /** Subscribe to state changes. Returns an unsubscribe function. */
    subscribe(callback) {
      const listener = (changes, area) => {
        if (area !== "local" || !changes[KEY]) return;
        callback(changes[KEY].newValue ? migrate(changes[KEY].newValue) : defaultState());
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },

    /** Convenience: open the dashboard, optionally on a specific view. */
    openDashboard(hash) {
      const url = chrome.runtime.getURL("src/dashboard/dashboard.html") + (hash ? "#" + hash : "");
      if (chrome.tabs && chrome.tabs.create) {
        return chrome.tabs.create({ url });
      }
      window.open(url, "_blank");
    },
  };
})();
