/*!
 * Tada — shared constants & utilities.
 *
 * Plain (non-module) script so the exact same file can be used by:
 *   - the MV3 service worker (via importScripts)
 *   - content scripts
 *   - extension pages (popup / dashboard / options) via <script src>
 *
 * Everything hangs off the global `Tada` namespace.
 */
(function () {
  "use strict";

  const Tada = (globalThis.Tada = globalThis.Tada || {});

  Tada.APP = { name: "Tada", version: "1.0.0" };

  Tada.STORAGE_KEY = "tada_state_v1";
  Tada.HISTORY_LIMIT = 2000;
  Tada.TRASH_RETENTION_DAYS = 30;

  Tada.PRIORITIES = ["none", "low", "medium", "high"];
  Tada.PRIORITY_META = {
    none: { label: "None", color: "#94a3b8", rank: 0 },
    low: { label: "Low", color: "#3b82f6", rank: 1 },
    medium: { label: "Medium", color: "#f59e0b", rank: 2 },
    high: { label: "High", color: "#ef4444", rank: 3 },
  };

  /* Human-readable descriptions for every entry written to the activity log. */
  Tada.HISTORY_ACTIONS = {
    "todo:add": { label: "created a task", icon: "＋", tone: "add" },
    "todo:update": { label: "edited a task", icon: "✎", tone: "edit" },
    "todo:complete": { label: "completed a task", icon: "✓", tone: "done" },
    "todo:uncomplete": { label: "reopened a task", icon: "↺", tone: "open" },
    "todo:delete": { label: "moved a task to trash", icon: "🗑", tone: "warn" },
    "todo:restore": { label: "restored a task", icon: "↩", tone: "add" },
    "todo:purge": { label: "deleted a task forever", icon: "✖", tone: "warn" },
    "todo:reorder": { label: "reordered tasks", icon: "⇅", tone: "edit" },
    "todo:clear-completed": { label: "cleared completed tasks", icon: "🧹", tone: "warn" },
    "subtask:add": { label: "added a subtask", icon: "＋", tone: "edit" },
    "subtask:update": { label: "updated a subtask", icon: "✎", tone: "edit" },
    "subtask:delete": { label: "removed a subtask", icon: "✖", tone: "edit" },
    "list:add": { label: "created a list", icon: "＋", tone: "add" },
    "list:update": { label: "updated a list", icon: "✎", tone: "edit" },
    "list:delete": { label: "deleted a list", icon: "🗑", tone: "warn" },
    "settings:update": { label: "changed settings", icon: "⚙", tone: "edit" },
    "history:clear": { label: "cleared history", icon: "🧹", tone: "warn" },
    "state:import": { label: "imported data", icon: "⇪", tone: "add" },
    "state:reset": { label: "reset all data", icon: "⟲", tone: "warn" },
    "trash:purge-expired": { label: "auto-purged old trash", icon: "🧹", tone: "warn" },
  };

  Tada.SORT_MODES = [
    { id: "manual", label: "Manual order" },
    { id: "priority", label: "Priority" },
    { id: "due", label: "Due date" },
    { id: "created", label: "Newest first" },
    { id: "updated", label: "Recently updated" },
    { id: "alpha", label: "Alphabetical" },
  ];

  Tada.GROUP_MODES = [
    { id: "none", label: "No grouping" },
    { id: "list", label: "By list" },
    { id: "priority", label: "By priority" },
    { id: "due", label: "By due date" },
  ];

  const PAD = (n) => String(n).padStart(2, "0");

  const util = {
    uid() {
      return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    },

    now() {
      return Date.now();
    },

    clamp(n, min, max) {
      return Math.min(max, Math.max(min, n));
    },

    /* ---- dates ---------------------------------------------------------- */

    todayISO(date = new Date()) {
      return `${date.getFullYear()}-${PAD(date.getMonth() + 1)}-${PAD(date.getDate())}`;
    },

    parseISO(iso) {
      if (!iso) return null;
      const parts = String(iso).split("-").map(Number);
      if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
      return new Date(parts[0], parts[1] - 1, parts[2]);
    },

    daysUntil(iso) {
      const d = util.parseISO(iso);
      if (!d) return null;
      const today = util.parseISO(util.todayISO());
      return Math.round((d - today) / 86400000);
    },

    formatDate(iso, opts) {
      const d = util.parseISO(iso);
      if (!d) return "";
      return d.toLocaleDateString(undefined, opts || { month: "short", day: "numeric", year: "numeric" });
    },

    /** Returns a badge descriptor for a due date. */
    dueMeta(iso) {
      if (!iso) return null;
      const diff = util.daysUntil(iso);
      if (diff === null) return null;
      if (diff < 0) return { label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d overdue`, tone: "overdue", diff };
      if (diff === 0) return { label: "Today", tone: "today", diff };
      if (diff === 1) return { label: "Tomorrow", tone: "soon", diff };
      if (diff <= 7) return { label: util.formatDate(iso, { weekday: "short", month: "short", day: "numeric" }), tone: "soon", diff };
      return { label: util.formatDate(iso, { month: "short", day: "numeric" }), tone: "later", diff };
    },

    relativeTime(ms) {
      if (!ms) return "";
      const diff = Date.now() - ms;
      const sec = Math.round(diff / 1000);
      if (sec < 45) return "just now";
      const min = Math.round(sec / 60);
      if (min < 60) return `${min}m ago`;
      const hr = Math.round(min / 60);
      if (hr < 24) return `${hr}h ago`;
      const day = Math.round(hr / 24);
      if (day < 7) return `${day}d ago`;
      const wk = Math.round(day / 7);
      if (wk < 5) return `${wk}w ago`;
      const mo = Math.round(day / 30);
      if (mo < 12) return `${mo}mo ago`;
      return `${Math.round(day / 365)}y ago`;
    },

    /** Friendly day heading used by the history timeline. */
    dayLabel(ms) {
      const d = new Date(ms);
      const today = util.todayISO();
      const that = util.todayISO(d);
      if (that === today) return "Today";
      const y = new Date();
      y.setDate(y.getDate() - 1);
      if (that === util.todayISO(y)) return "Yesterday";
      return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    },

    /* ---- strings -------------------------------------------------------- */

    escapeHtml(value) {
      return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c]));
    },

    truncate(s, n) {
      s = String(s || "");
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    },

    hostnameOf(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch (_) {
        return "";
      }
    },

    /* ---- collections ---------------------------------------------------- */

    sortTodos(todos, mode) {
      const arr = todos.slice();
      const pm = Tada.PRIORITY_META;
      const cmp = {
        manual: (a, b) => (a.order || 0) - (b.order || 0),
        priority: (a, b) => pm[b.priority || "none"].rank - pm[a.priority || "none"].rank || (a.order || 0) - (b.order || 0),
        due: (a, b) => {
          if (!a.dueDate && !b.dueDate) return (a.order || 0) - (b.order || 0);
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
        },
        created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
        updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
        alpha: (a, b) => String(a.title).localeCompare(String(b.title)),
      }[mode] || ((a, b) => (a.order || 0) - (b.order || 0));
      return arr.sort(cmp);
    },

    matchesQuery(todo, query) {
      if (!query) return true;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = [
        todo.title,
        todo.notes,
        (todo.tags || []).join(" "),
        (todo.subtasks || []).map((s) => s.title).join(" "),
        todo.sourceTitle,
        todo.sourceUrl,
      ]
        .filter(Boolean)
        .join(" \u0000 ")
        .toLowerCase();
      return q.split(/\s+/).every((term) => hay.includes(term.replace(/^#/, "")));
    },

    countActive(todos) {
      return todos.filter((t) => !t.completed && !t.deletedAt).length;
    },

    subtaskProgress(todo) {
      const subs = todo.subtasks || [];
      const done = subs.filter((s) => s.done).length;
      return { done, total: subs.length };
    },

    /* ---- async misc ----------------------------------------------------- */

    debounce(fn, wait) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    download(filename, text, mime) {
      const blob = new Blob([text], { type: mime || "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };

  Tada.util = util;

  /* Apply a theme ("system" | "light" | "dark") to a document root. */
  Tada.applyTheme = function applyTheme(theme, root) {
    const el = root || document.documentElement;
    const resolved =
      theme === "system" || !theme
        ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    el.dataset.theme = resolved;
    return resolved;
  };
})();
