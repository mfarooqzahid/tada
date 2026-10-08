/* Tada — toolbar popup. */
(function () {
  "use strict";
  const T = globalThis.Tada;

  const el = (id) => document.getElementById(id);
  let data = null;
  let filter = "active";
  let query = "";

  const ICON_CHECK =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const ICON_TRASH =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';

  function visibleTodos() {
    let todos = data.todos.filter((t) => !t.deletedAt);
    const today = T.util.todayISO();
    if (filter === "active") todos = todos.filter((t) => !t.completed);
    else if (filter === "done") todos = todos.filter((t) => t.completed);
    else if (filter === "today") todos = todos.filter((t) => !t.completed && t.dueDate && t.dueDate <= today);
    else if (filter === "overdue") todos = todos.filter((t) => !t.completed && t.dueDate && t.dueDate < today);
    todos = todos.filter((t) => T.util.matchesQuery(t, query));
    return T.util.sortTodos(todos, "priority").reverse().sort((a, b) => Number(a.completed) - Number(b.completed));
  }

  function render() {
    const active = T.util.countActive(data.todos);
    el("count").textContent = active ? `${active} active` : "all clear";

    const todos = visibleTodos();
    const list = el("list");
    if (!todos.length) {
      list.innerHTML = emptyHtml();
    } else {
      list.innerHTML = todos
        .map((t) => {
          const p = t.priority || "none";
          const due = T.util.dueMeta(t.dueDate);
          const sub = T.util.subtaskProgress(t);
          const chips = [];
          if (due) chips.push(`<span class="chip due-${due.tone}">${T.util.escapeHtml(due.label)}</span>`);
          if (sub.total) chips.push(`<span class="chip">${sub.done}/${sub.total}</span>`);
          if (t.sourceTitle) chips.push(`<span class="chip">from ${T.util.escapeHtml(T.util.truncate(t.sourceTitle, 20))}</span>`);
          (t.tags || []).slice(0, 2).forEach((tag) => chips.push(`<span class="chip tag">#${T.util.escapeHtml(tag)}</span>`));
          return `
          <div class="item p-${p} ${t.completed ? "done" : ""}" data-id="${t.id}">
            <span class="stripe"></span>
            <button class="check" data-check="${t.id}" title="Toggle">${ICON_CHECK}</button>
            <div class="body">
              <div class="title">${T.util.escapeHtml(t.title)}</div>
              ${chips.length ? `<div class="meta">${chips.join("")}</div>` : ""}
            </div>
            <button class="del" data-del="${t.id}" title="Trash">${ICON_TRASH}</button>
          </div>`;
        })
        .join("");
    }

    const doneCount = data.todos.filter((t) => t.completed && !t.deletedAt).length;
    el("stat").textContent = `${active} open · ${doneCount} done`;
  }

  function emptyHtml() {
    if (query) return `<div class="empty"><span class="big">🔍</span>No matches.</div>`;
    if (filter === "done") return `<div class="empty"><span class="big">🎯</span>No completed tasks yet.</div>`;
    if (filter === "overdue") return `<div class="empty"><span class="big">✅</span>Nothing overdue. Nice.</div>`;
    if (filter === "today") return `<div class="empty"><span class="big">☀️</span>Nothing due today.</div>`;
    if (filter === "all") return `<div class="empty"><span class="big">📝</span>No tasks yet.</div>`;
    return `<div class="empty"><span class="big">✨</span>All clear. Enjoy the calm.</div>`;
  }

  function add() {
    const input = el("newtitle");
    const title = input.value.trim();
    if (!title) return;
    T.api.dispatch("todo:add", { title, priority: el("newprio").value });
    input.value = "";
    input.focus();
  }

  function bind() {
    el("add").addEventListener("click", add);
    el("newtitle").addEventListener("keydown", (e) => {
      if (e.key === "Enter") add();
    });
    el("newprio").addEventListener("change", () => {
      T.api.dispatch("settings:update", { patch: { quickAddPriority: el("newprio").value }, silent: true });
    });
    el("dashboard").addEventListener("click", () => {
      T.api.openDashboard();
      window.close();
    });
    el("settings").addEventListener("click", () => {
      T.api.openDashboard("settings");
      window.close();
    });
    el("theme").addEventListener("click", () => {
      const order = ["system", "light", "dark"];
      const cur = data.settings.theme || "system";
      const next = order[(order.indexOf(cur) + 1) % order.length];
      T.api.dispatch("settings:update", { patch: { theme: next }, silent: true });
    });
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        filter = tab.dataset.filter;
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        render();
      });
    });
    el("search").addEventListener("input", (e) => {
      query = e.target.value;
      render();
    });
    el("list").addEventListener("click", (e) => {
      const check = e.target.closest("[data-check]");
      if (check) {
        const todo = T.store.findTodo(data, check.dataset.check);
        if (todo) T.api.dispatch(todo.completed ? "todo:uncomplete" : "todo:complete", { id: todo.id });
        return;
      }
      const del = e.target.closest("[data-del]");
      if (del) T.api.dispatch("todo:delete", { id: del.dataset.del });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        document.querySelector(".searchrow").classList.add("open");
        el("search").focus();
      }
    });
  }

  async function init() {
    data = await T.api.getState();
    T.applyTheme(data.settings.theme);
    el("newprio").value = data.settings.quickAddPriority || "none";
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if ((data.settings.theme || "system") === "system") T.applyTheme("system");
    });
    bind();
    render();
    el("newtitle").focus();

    T.api.subscribe((next) => {
      data = next;
      render();
    });
  }

  init();
})();
