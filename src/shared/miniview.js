/*!
 * Tada — shared minimal todo view.
 *
 * Renders the core experience (new-task box, open list, expandable completed
 * list) into any container. Used by BOTH the dashboard page and the on-page
 * overlay so they stay identical.
 *
 * Plain script: exposes `Tada.miniView` and `Tada.MINI_CSS`.
 */
(function () {
  "use strict";

  const Tada = (globalThis.Tada = globalThis.Tada || {});
  const U = Tada.util;
  const esc = U.escapeHtml;

  const I = {
    plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  };

  const CHECK_URI =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E";

  /* Self-contained styles for the .mv markup. Colours come from CSS variables
     so the host page/panel can theme it; soft light defaults included. */
  Tada.MINI_CSS = `
    .mv, .mv * { box-sizing: border-box; }
    .mv { color: var(--fg, #1b1e28); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .mv button { font: inherit; cursor: pointer; border: none; background: none; color: inherit; }
    .mv input, .mv textarea { font: inherit; color: inherit; }
    .mv ul { list-style: none; margin: 0; padding: 0; }

    /* ---- new task ---- */
    .mv-newbtn {
      display: flex; align-items: center; gap: 11px; width: 100%;
      padding: 13px 15px; margin: 2px 0 12px;
      border: 1px solid transparent; border-radius: 14px;
      background: var(--accent-soft, rgba(91,108,255,.12));
      color: var(--accent, #5b6cff);
      font-size: 14.5px; font-weight: 600;
      transition: background .14s, transform .06s, box-shadow .14s;
    }
    .mv-newbtn:hover { background: var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-newbtn:active { transform: translateY(1px); }
    .mv-newbtn:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-form { display: flex; align-items: center; gap: 11px; padding: 4px 2px 14px; }
    .mv-form[hidden] { display: none; }
    .mv-plus { color: var(--accent, #5b6cff); display: flex; flex: none; }
    .mv-input {
      flex: 1; min-width: 0; border: none; border-bottom: 2px solid var(--accent, #5b6cff);
      background: transparent; padding: 9px 2px; font-size: 16px; outline: none;
    }
    .mv-input::placeholder { color: var(--muted-2, var(--muted, #9aa1ad)); }
    .mv-cancel { color: var(--muted, #6b7280); font-size: 13px; padding: 7px 10px; border-radius: 9px; }
    .mv-cancel:hover { background: var(--soft, #f6f7fb); color: var(--fg, #1b1e28); }

    /* ---- rows ---- */
    .mv-list { display: flex; flex-direction: column; }
    .mv-row {
      display: flex; align-items: flex-start; gap: 13px;
      padding: 13px 10px; position: relative;
      border-bottom: 1px solid var(--border-soft, #eff1f7);
      transition: background .14s;
    }
    .mv-row:last-child { border-bottom: none; }
    .mv-row:hover { background: var(--row-hover, rgba(27,30,40,.035)); }

    .mv-check {
      appearance: none; -webkit-appearance: none; flex: none;
      width: 23px; height: 23px; margin: 0; border-radius: 50%;
      border: 2px solid var(--border, #e7e9f2); background: transparent; cursor: pointer;
      transition: border-color .14s, box-shadow .14s, background .14s, transform .08s;
    }
    .mv-check:hover { border-color: var(--accent, #5b6cff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-check:active { transform: scale(.92); }
    .mv-check:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-check:checked {
      border-color: transparent;
      background: url("${CHECK_URI}") center / 13px no-repeat,
                  linear-gradient(135deg, var(--accent, #5b6cff), var(--accent-2, var(--accent, #5b6cff)));
    }

    .mv-body { flex: 1; min-width: 0; }
    .mv-title {
      width: 100%; border: 1px solid transparent; background: transparent;
      padding: 3px 7px; margin: -3px -7px; border-radius: 9px;
      font-size: 15px; font-weight: 500; line-height: 1.45; letter-spacing: -0.005em;
      outline: none; text-overflow: ellipsis;
      transition: background .14s, border-color .14s, box-shadow .14s;
    }
    .mv-title:hover { border-color: var(--border-soft, #eff1f7); }
    .mv-title:focus { border-color: var(--accent, #5b6cff); background: var(--bg, #fff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-row.done .mv-title { color: var(--muted, #6b7280); text-decoration: line-through; text-decoration-color: var(--muted-2, #9aa1ad); }

    .mv-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 0 1px; }
    .mv-chip {
      font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
      background: var(--soft, #f6f7fb); color: var(--muted, #6b7280);
      border: 1px solid var(--border-soft, #eff1f7);
    }
    .mv-chip.due-overdue { background: rgba(229,72,77,.11); color: #dc2626; border-color: transparent; }
    .mv-chip.due-today { background: rgba(245,158,11,.14); color: #c2740a; border-color: transparent; }
    .mv-chip.due-soon { background: var(--accent-soft, rgba(91,108,255,.12)); color: var(--accent, #5b6cff); border-color: transparent; }

    .mv-expand, .mv-del {
      flex: none; width: 30px; height: 30px; border-radius: 9px; color: var(--muted-2, #9aa1ad);
      display: flex; align-items: center; justify-content: center; opacity: 0;
      transition: opacity .14s, background .14s, color .14s, transform .14s;
    }
    .mv-row:hover .mv-expand, .mv-row:hover .mv-del,
    .mv-expand:focus-visible, .mv-del:focus-visible { opacity: 1; }
    .mv-expand:hover { background: var(--soft, #f6f7fb); color: var(--fg, #1b1e28); }
    .mv-expand.open { opacity: 1; transform: rotate(180deg); }
    .mv-del:hover { background: rgba(229,72,77,.12); color: var(--danger, #e5484d); }
    .mv-row.done .mv-expand, .mv-row.done .mv-del { opacity: 0; }
    .mv-row.done:hover .mv-expand, .mv-row.done:hover .mv-del { opacity: 1; }

    /* ---- detail ---- */
    .mv-detail { margin-top: 10px; display: flex; flex-direction: column; gap: 11px; }
    .mv-notes {
      width: 100%; min-height: 60px; resize: vertical; padding: 10px 12px;
      border: 1px solid var(--border, #e7e9f2); border-radius: 11px;
      background: var(--soft, #f6f7fb); outline: none; font-size: 13.5px; line-height: 1.55;
      transition: border-color .14s, box-shadow .14s, background-color .14s;
    }
    .mv-notes:focus { border-color: var(--accent, #5b6cff); background: var(--bg, #fff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-drow { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted, #6b7280); }
    .mv-due {
      border: 1px solid var(--border, #e7e9f2); border-radius: 9px; padding: 6px 9px;
      background: var(--soft, #f6f7fb); outline: none; color: var(--fg, #1b1e28); font-size: 12.5px;
    }
    .mv-due:focus { border-color: var(--accent, #5b6cff); }
    .mv-subs { display: flex; flex-direction: column; gap: 3px; }
    .mv-sub { display: flex; align-items: center; gap: 9px; padding: 4px 6px; border-radius: 8px; }
    .mv-sub:hover { background: var(--soft, #f6f7fb); }
    .mv-scheck {
      appearance: none; -webkit-appearance: none; width: 17px; height: 17px; flex: none;
      border: 2px solid var(--border, #e7e9f2); border-radius: 6px; cursor: pointer;
      transition: background .12s, border-color .12s;
    }
    .mv-scheck:checked {
      border-color: transparent;
      background: url("${CHECK_URI}") center / 10px no-repeat,
                  linear-gradient(135deg, var(--accent, #5b6cff), var(--accent-2, var(--accent, #5b6cff)));
    }
    .mv-stitle { flex: 1; min-width: 0; border: none; background: transparent; outline: none; font-size: 13px; border-radius: 6px; padding: 2px 5px; }
    .mv-stitle:focus { background: var(--bg, #fff); box-shadow: 0 0 0 3px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-sub.done .mv-stitle { color: var(--muted, #6b7280); text-decoration: line-through; }
    .mv-sdel { color: var(--muted-2, #9aa1ad); width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex: none; }
    .mv-sdel:hover { color: var(--danger, #e5484d); background: rgba(229,72,77,.12); }
    .mv-subadd .mv-subinput {
      width: 100%; border: 1px dashed var(--border, #dcdcdc); border-radius: 9px;
      padding: 7px 10px; background: transparent; outline: none; font-size: 12.5px;
      transition: border-color .14s, background-color .14s;
    }
    .mv-subadd .mv-subinput:focus { border-color: var(--accent, #5b6cff); border-style: solid; background: var(--soft, #f6f7fb); }

    /* ---- completed ---- */
    .mv-completed { margin-top: 22px; padding-top: 6px; }
    .mv-chead {
      display: flex; align-items: center; gap: 9px; padding: 10px 12px;
      color: var(--muted, #6b7280); font-size: 13px; font-weight: 650; width: 100%;
      border-radius: 11px; transition: background .14s, color .14s;
    }
    .mv-chead:hover { background: var(--soft, #f6f7fb); color: var(--fg, #1b1e28); }
    .mv-chead:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-chead .mv-chev { display: flex; transition: transform .16s; color: var(--muted-2, #9aa1ad); }
    .mv-chead[aria-expanded="true"] .mv-chev { transform: rotate(180deg); }
    .mv-clist[hidden] { display: none; }
    .mv-clist { margin-top: 2px; }
    .mv-empty { color: var(--muted, #6b7280); font-size: 14px; padding: 34px 12px 40px; line-height: 1.65; text-align: center; }
  `;

  /* ---------------------------------------------------------------- rows */

  function chips(t) {
    const out = [];
    const due = U.dueMeta(t.dueDate);
    if (due && !t.completed) out.push(`<span class="mv-chip due-${due.tone}">${esc(due.label)}</span>`);
    const sub = U.subtaskProgress(t);
    if (sub.total) out.push(`<span class="mv-chip">${sub.done}/${sub.total} subtasks</span>`);
    if (t.notes) out.push(`<span class="mv-chip">note</span>`);
    return out.join("");
  }

  function detailHtml(t) {
    const subs = (t.subtasks || [])
      .map(
        (s) => `<div class="mv-sub ${s.done ? "done" : ""}">
          <input type="checkbox" class="mv-scheck" data-mv="sub-toggle" data-id="${t.id}" data-sid="${s.id}" ${s.done ? "checked" : ""} aria-label="Subtask complete" />
          <input type="text" class="mv-stitle" data-mv="sub-title" data-id="${t.id}" data-sid="${s.id}" value="${esc(s.title)}" aria-label="Subtask" />
          <button type="button" class="mv-sdel" data-mv="sub-del" data-id="${t.id}" data-sid="${s.id}" aria-label="Remove subtask" title="Remove">✕</button>
        </div>`
      )
      .join("");
    return `<div class="mv-detail">
      <textarea class="mv-notes" data-mv="notes" data-id="${t.id}" placeholder="Notes…" aria-label="Notes">${esc(t.notes || "")}</textarea>
      <div class="mv-drow"><label>Due <input type="date" class="mv-due" data-mv="due" data-id="${t.id}" value="${t.dueDate || ""}" aria-label="Due date" /></label></div>
      <div class="mv-subs">
        ${subs}
        <div class="mv-subadd"><input type="text" class="mv-subinput" data-mv="sub-input" data-id="${t.id}" placeholder="Add subtask…" aria-label="Add subtask" /></div>
      </div>
    </div>`;
  }

  function rowHtml(t, expanded) {
    const done = !!t.completed;
    const meta = chips(t);
    const completedMeta =
      done && t.completedAt ? `<div class="mv-meta"><span class="mv-chip">completed ${esc(U.relativeTime(t.completedAt))}</span></div>` : "";
    return `<li class="mv-row ${done ? "done" : ""}" data-id="${t.id}">
      <input type="checkbox" class="mv-check" data-mv="toggle" data-id="${t.id}" ${done ? "checked" : ""} aria-label="${done ? "Mark incomplete" : "Mark complete"}" />
      <div class="mv-body">
        <input type="text" class="mv-title" data-mv="title" data-id="${t.id}" value="${esc(t.title)}" aria-label="Task title" />
        ${meta ? `<div class="mv-meta">${meta}</div>` : ""}
        ${completedMeta}
        ${expanded ? detailHtml(t) : ""}
      </div>
      <button type="button" class="mv-expand ${expanded ? "open" : ""}" data-mv="expand" data-id="${t.id}" aria-label="Toggle details" title="Details">${I.chevron}</button>
      <button type="button" class="mv-del" data-mv="del" data-id="${t.id}" aria-label="Delete task" title="Delete">${I.trash}</button>
    </li>`;
  }

  /* ------------------------------------------------------------ component */

  /**
   * create(root, ctx)
   *   root : container element (normal DOM or inside a shadow root)
   *   ctx  : { getState(), dispatch(action,payload), getQuery(), showToast?(msg, undoFn) }
   * returns { render(state), focusNew(), isNewOpen() }
   */
  function create(root, ctx) {
    root.innerHTML = `
      <div class="mv">
        <button type="button" class="mv-newbtn" data-mv="open-new" aria-expanded="false">
          ${I.plus}<span>New task</span>
        </button>
        <form class="mv-form" data-mv="form" hidden>
          <span class="mv-plus" aria-hidden="true">${I.plus}</span>
          <input class="mv-input" data-mv="input" type="text" placeholder="What needs doing?" aria-label="New task" autocomplete="off" />
          <button type="button" class="mv-cancel" data-mv="cancel">Cancel</button>
        </form>
        <ul class="mv-list" data-mv="list"></ul>
        <p class="mv-empty" data-mv="empty" hidden></p>
        <div class="mv-completed" data-mv="completed-wrap" hidden>
          <button type="button" class="mv-chead" data-mv="toggle-completed" aria-expanded="false">
            <span class="mv-chev" aria-hidden="true">${I.chevron}</span>
            <span data-mv="completed-label">Completed</span>
          </button>
          <ul class="mv-clist" data-mv="clist" hidden></ul>
        </div>
      </div>`;

    const q = (sel) => root.querySelector(sel);
    const newBtn = q('[data-mv="open-new"]');
    const form = q('[data-mv="form"]');
    const input = q('[data-mv="input"]');
    const list = q('[data-mv="list"]');
    const empty = q('[data-mv="empty"]');
    const completedWrap = q('[data-mv="completed-wrap"]');
    const clist = q('[data-mv="clist"]');
    const completedHead = q('[data-mv="toggle-completed"]');
    const completedLabel = q('[data-mv="completed-label"]');

    const ui = { state: null, expanded: new Set(), completedOpen: false };

    function query() {
      return (ctx.getQuery && ctx.getQuery()) || "";
    }

    function visible(t) {
      return !t.deletedAt && U.matchesQuery(t, query());
    }

    function openTodos() {
      return U.sortTodos(ui.state.todos.filter((t) => visible(t) && !t.completed), "manual");
    }

    function doneTodos() {
      return ui.state.todos
        .filter((t) => visible(t) && t.completed)
        .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
    }

    function render(state) {
      if (state) ui.state = state;
      if (!ui.state) return;

      const open = openTodos();
      const done = doneTodos();

      list.innerHTML = open.map((t) => rowHtml(t, ui.expanded.has(t.id))).join("");

      if (!open.length) {
        empty.hidden = false;
        empty.textContent = query()
          ? "No tasks match your search."
          : done.length
          ? "All clear. Nothing left to do. ✨"
          : "Nothing here yet — add your first task above.";
      } else {
        empty.hidden = true;
      }

      completedWrap.hidden = done.length === 0;
      completedLabel.textContent = `Completed (${done.length})`;
      clist.innerHTML = done.map((t) => rowHtml(t, ui.expanded.has(t.id))).join("");
      clist.hidden = !ui.completedOpen;
      completedHead.setAttribute("aria-expanded", String(ui.completedOpen));
      return ui;
    }

    /* ------------------------------------------------------------- events */

    function showForm(focus) {
      form.hidden = false;
      newBtn.setAttribute("aria-expanded", "true");
      newBtn.hidden = true;
      if (focus !== false) setTimeout(() => input.focus(), 0);
    }
    function hideForm() {
      form.hidden = true;
      newBtn.hidden = false;
      newBtn.setAttribute("aria-expanded", "false");
    }

    function focusNew() {
      showForm(true);
    }

    root.addEventListener("click", (e) => {
      const el = e.target.closest("[data-mv]");
      if (!el) return;
      const act = el.dataset.mv;
      const id = el.dataset.id;

      if (act === "open-new") return showForm(true);
      if (act === "cancel") return hideForm();
      if (act === "expand") {
        if (ui.expanded.has(id)) ui.expanded.delete(id);
        else ui.expanded.add(id);
        return render();
      }
      if (act === "toggle-completed") {
        ui.completedOpen = !ui.completedOpen;
        return render();
      }
      if (act === "del") {
        const t = Tada.store.findTodo(ui.state, id);
        ctx.dispatch("todo:delete", { id });
        if (ctx.showToast && t) ctx.showToast(`Deleted “${U.truncate(t.title, 24)}”`, () => ctx.dispatch("todo:restore", { id }));
        return;
      }
      if (act === "sub-del") {
        ctx.dispatch("subtask:delete", { todoId: id, subtaskId: el.dataset.sid });
        return;
      }
    });

    root.addEventListener("change", (e) => {
      const el = e.target.closest("[data-mv]");
      if (!el) return;
      const act = el.dataset.mv;
      const id = el.dataset.id;
      if (act === "toggle") {
        ctx.dispatch(el.checked ? "todo:complete" : "todo:uncomplete", { id });
      } else if (act === "title") {
        const value = el.value.trim();
        const t = Tada.store.findTodo(ui.state, id);
        if (t && value && value !== t.title) ctx.dispatch("todo:update", { id, patch: { title: value } });
        else if (!value) el.value = t ? t.title : "";
      } else if (act === "notes") {
        ctx.dispatch("todo:update", { id, patch: { notes: el.value } });
      } else if (act === "due") {
        ctx.dispatch("todo:update", { id, patch: { dueDate: el.value || null } });
      } else if (act === "sub-toggle") {
        ctx.dispatch("subtask:update", { todoId: id, subtaskId: el.dataset.sid, patch: { done: el.checked } });
      } else if (act === "sub-title") {
        const value = el.value.trim();
        if (value) ctx.dispatch("subtask:update", { todoId: id, subtaskId: el.dataset.sid, patch: { title: value } });
      }
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      ctx.dispatch("todo:add", { title });
      input.value = "";
      input.focus();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (input.value) input.value = "";
        else hideForm();
      }
    });

    root.addEventListener("keydown", (e) => {
      const el = e.target.closest("[data-mv]");
      if (!el) return;
      const act = el.dataset.mv;
      if (act === "title" && e.key === "Enter") {
        e.preventDefault();
        el.blur();
      } else if (act === "sub-input" && e.key === "Enter") {
        e.preventDefault();
        const value = el.value.trim();
        if (value) {
          ctx.dispatch("subtask:add", { todoId: el.dataset.id, title: value });
          el.value = "";
        }
      } else if (act === "sub-title" && e.key === "Enter") {
        e.preventDefault();
        el.blur();
      }
    });

    return { render, focusNew, isNewOpen: () => !form.hidden, root, ui };
  }

  Tada.miniView = { create };
})();
