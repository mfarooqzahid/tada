/*!
 * Tada — shared minimal todo view.
 *
 * Renders the core experience (new-task box, open list, expandable completed
 * list) into any container. Used by BOTH the dashboard page and the on-page
 * overlay so they stay identical.
 *
 * Each task has a read-only VIEW mode (default) and an EDIT mode. URLs are
 * auto-linked everywhere, and a task can also carry an explicit link.
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
    pencil: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.5-1.5"/></svg>',
  };

  const CHECK_URI =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E";

  /* Auto-linkify plain text. Escapes first, then wraps bare URLs. */
  function linkify(text) {
    if (!text) return "";
    return esc(text).replace(
      /(https?:\/\/[^\s<]+)/g,
      (m) => `<a class="mv-link" href="${m}" target="_blank" rel="noopener noreferrer">${m}</a>`
    );
  }

  function urlLabel(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "") + (u.pathname && u.pathname !== "/" ? u.pathname : "");
    } catch (_) {
      return url;
    }
  }

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
      padding: 13px 15px; margin: 2px 0 14px;
      border: 1px solid transparent; border-radius: 14px;
      background: var(--accent-soft, rgba(91,108,255,.12));
      color: var(--accent, #5b6cff);
      font-size: 14.5px; font-weight: 600;
      transition: background .14s, transform .06s, box-shadow .14s;
    }
    .mv-newbtn:hover { background: var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-newbtn:active { transform: translateY(1px); }
    .mv-newbtn:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-form { display: flex; align-items: center; gap: 11px; padding: 4px 2px 16px; }
    .mv-form[hidden] { display: none; }
    .mv-plus { color: var(--accent, #5b6cff); display: flex; flex: none; }
    .mv-input {
      flex: 1; min-width: 0; border: none; border-bottom: 2px solid var(--accent, #5b6cff);
      background: transparent; padding: 9px 2px; font-size: 16px; outline: none;
    }
    .mv-input::placeholder { color: var(--muted-2, #9aa1ad); }
    .mv-cancel { color: var(--muted, #6b7280); font-size: 13px; padding: 7px 10px; border-radius: 9px; }
    .mv-cancel:hover { background: var(--soft, #f6f7fb); color: var(--fg, #1b1e28); }

    /* ---- rows (bordered cards so tasks are clearly separated) ---- */
    .mv-list { display: flex; flex-direction: column; }
    .mv-row {
      display: flex; align-items: flex-start; gap: 13px;
      padding: 13px 14px; margin-bottom: 10px;
      background: var(--surface, var(--bg, #fff));
      border: 1px solid var(--border, #e2e4e8);
      border-radius: 14px;
      transition: border-color .14s, box-shadow .14s, background .14s;
    }
    .mv-row:hover { border-color: var(--border-strong, var(--accent, #5b6cff)); box-shadow: 0 10px 26px -18px rgba(20, 24, 40, .5); }
    .mv-row.editing { border-color: var(--accent, #5b6cff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }

    .mv-check {
      appearance: none; -webkit-appearance: none; flex: none;
      width: 23px; height: 23px; margin: 0; border-radius: 50%;
      border: 2px solid var(--border, #cbd0dc); background: transparent; cursor: pointer;
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
      display: block; font-size: 15px; font-weight: 500; line-height: 1.5;
      letter-spacing: -0.005em; word-break: break-word; overflow-wrap: anywhere;
      white-space: pre-wrap; cursor: text;
    }
    .mv-row.done .mv-title { color: var(--muted, #6b7280); text-decoration: line-through; text-decoration-color: var(--muted-2, #9aa1ad); }
    .mv-link { color: var(--accent, #5b6cff); text-decoration: none; word-break: break-all; }
    .mv-link:hover { text-decoration: underline; }

    .mv-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 7px 0 0; align-items: center; }
    .mv-chip {
      font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px;
      background: var(--soft, #f6f7fb); color: var(--muted, #6b7280);
      border: 1px solid var(--border-soft, #eff1f7);
      display: inline-flex; align-items: center; gap: 5px; text-decoration: none;
    }
    .mv-chip.due-overdue { background: rgba(229,72,77,.11); color: #dc2626; border-color: transparent; }
    .mv-chip.due-today { background: rgba(245,158,11,.14); color: #c2740a; border-color: transparent; }
    .mv-chip.due-soon { background: var(--accent-soft, rgba(91,108,255,.12)); color: var(--accent, #5b6cff); border-color: transparent; }
    .mv-chip.mv-chip-link { color: var(--accent, #5b6cff); }
    .mv-chip.mv-chip-link:hover { background: var(--accent-soft, rgba(91,108,255,.12)); }

    .mv-note-preview {
      margin: 7px 0 0; font-size: 13.5px; line-height: 1.55; color: var(--muted, #6b7280);
      white-space: pre-wrap; overflow-wrap: anywhere;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }

    .mv-expand, .mv-edit-btn, .mv-del {
      flex: none; width: 30px; height: 30px; border-radius: 9px; color: var(--muted-2, #9aa1ad);
      display: flex; align-items: center; justify-content: center; opacity: 0;
      transition: opacity .14s, background .14s, color .14s, transform .14s;
    }
    .mv-row:hover .mv-expand, .mv-row:hover .mv-edit-btn, .mv-row:hover .mv-del,
    .mv-expand:focus-visible, .mv-edit-btn:focus-visible, .mv-del:focus-visible { opacity: 1; }
    .mv-expand:hover, .mv-edit-btn:hover { background: var(--soft, #f6f7fb); color: var(--fg, #1b1e28); }
    .mv-expand.open { opacity: 1; transform: rotate(180deg); }
    .mv-del:hover { background: rgba(229,72,77,.12); color: var(--danger, #e5484d); }

    /* ---- read-only detail (view mode) ---- */
    .mv-detail { margin-top: 11px; display: flex; flex-direction: column; gap: 9px; }
    .mv-note-text {
      margin: 0; font-size: 13.5px; line-height: 1.6; color: var(--muted, #6b7280);
      white-space: pre-wrap; word-break: break-word;
    }
    .mv-link-line {
      display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
      font-size: 13px; font-weight: 500; max-width: 100%;
    }
    .mv-link-line span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mv-empty-detail { font-size: 13px; color: var(--muted-2, #9aa1ad); }

    /* ---- edit mode ---- */
    .mv-edit { display: flex; flex-direction: column; gap: 11px; }
    .mv-title-input {
      width: 100%; border: 1px solid var(--border, #e2e4e8); background: var(--soft, #f6f7fb);
      border-radius: 10px; padding: 9px 11px; font-size: 15px; font-weight: 500; outline: none;
      font-family: inherit; line-height: 1.5; min-height: 42px; display: block;
      resize: none; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere;
      transition: border-color .14s, box-shadow .14s, background-color .14s;
    }
    .mv-title-input:focus { border-color: var(--accent, #5b6cff); background: var(--bg, #fff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-notes {
      width: 100%; min-height: 62px; resize: vertical; padding: 10px 12px;
      border: 1px solid var(--border, #e2e4e8); border-radius: 11px;
      background: var(--soft, #f6f7fb); outline: none; font-size: 13.5px; line-height: 1.55;
      white-space: pre-wrap; overflow-wrap: anywhere;
      transition: border-color .14s, box-shadow .14s, background-color .14s;
    }
    .mv-notes:focus { border-color: var(--accent, #5b6cff); background: var(--bg, #fff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-drow { display: flex; flex-wrap: wrap; gap: 14px; }
    .mv-field { display: flex; flex-direction: column; gap: 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--muted-2, #9aa1ad); }
    .mv-field input {
      border: 1px solid var(--border, #e2e4e8); border-radius: 9px; padding: 8px 10px;
      background: var(--soft, #f6f7fb); outline: none; font-size: 13px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--fg, #1b1e28);
    }
    .mv-field input:focus { border-color: var(--accent, #5b6cff); background: var(--bg, #fff); box-shadow: 0 0 0 4px var(--accent-ring, rgba(91,108,255,.22)); }
    .mv-field.mv-url { flex: 1; min-width: 180px; }
    .mv-field.mv-url input { width: 100%; }

    .mv-subs { display: flex; flex-direction: column; gap: 3px; }
    .mv-sub { display: flex; align-items: center; gap: 9px; padding: 4px 6px; border-radius: 8px; }
    .mv-sub:hover { background: var(--soft, #f6f7fb); }
    .mv-scheck {
      appearance: none; -webkit-appearance: none; width: 17px; height: 17px; flex: none;
      border: 2px solid var(--border, #cbd0dc); border-radius: 6px; cursor: pointer;
      transition: background .12s, border-color .12s;
    }
    .mv-scheck:checked {
      border-color: transparent;
      background: url("${CHECK_URI}") center / 10px no-repeat,
                  linear-gradient(135deg, var(--accent, #5b6cff), var(--accent-2, var(--accent, #5b6cff)));
    }
    .mv-stitle-text { flex: 1; font-size: 13px; color: var(--muted, #6b7280); }
    .mv-sub.done .mv-stitle-text { text-decoration: line-through; }
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

    .mv-edit-actions { display: flex; justify-content: flex-end; }
    .mv-done {
      padding: 9px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 600; color: #fff;
      background: linear-gradient(135deg, var(--accent, #5b6cff), var(--accent-2, var(--accent, #5b6cff)));
      box-shadow: 0 10px 22px -12px var(--accent, #5b6cff);
      transition: filter .14s, transform .06s;
    }
    .mv-done:hover { filter: brightness(1.06); }
    .mv-done:active { transform: translateY(1px); }

    /* ---- completed ---- */
    .mv-completed { margin-top: 26px; }
    .mv-chead {
      display: flex; align-items: center; gap: 9px; padding: 11px 12px;
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
    if (t.url) out.push(`<a class="mv-chip mv-chip-link" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${I.link}${esc(U.truncate(urlLabel(t.url), 28))}</a>`);
    const sub = U.subtaskProgress(t);
    if (sub.total) out.push(`<span class="mv-chip">${sub.done}/${sub.total} subtasks</span>`);
    return out.join("");
  }

  function subsView(t) {
    const subs = t.subtasks || [];
    if (!subs.length) return "";
    return `<div class="mv-subs">${subs
      .map(
        (s) => `<div class="mv-sub ${s.done ? "done" : ""}">
          <input type="checkbox" class="mv-scheck" data-mv="sub-toggle" data-id="${t.id}" data-sid="${s.id}" ${s.done ? "checked" : ""} aria-label="Subtask complete" />
          <span class="mv-stitle-text">${esc(s.title)}</span>
        </div>`
      )
      .join("")}</div>`;
  }

  function detailView(t) {
    const parts = [];
    if (t.notes) parts.push(`<p class="mv-note-text">${linkify(t.notes)}</p>`);
    if (t.url)
      parts.push(
        `<a class="mv-link mv-link-line" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">${I.link}<span>${esc(urlLabel(t.url))}</span></a>`
      );
    const sv = subsView(t);
    if (sv) parts.push(sv);
    if (!parts.length) parts.push(`<span class="mv-empty-detail">No notes, link or subtasks yet.</span>`);
    return `<div class="mv-detail">${parts.join("")}</div>`;
  }

  function subsEdit(t) {
    return (t.subtasks || [])
      .map(
        (s) => `<div class="mv-sub ${s.done ? "done" : ""}">
          <input type="checkbox" class="mv-scheck" data-mv="sub-toggle" data-id="${t.id}" data-sid="${s.id}" ${s.done ? "checked" : ""} aria-label="Subtask complete" />
          <input type="text" class="mv-stitle" data-mv="sub-title" data-id="${t.id}" data-sid="${s.id}" value="${esc(s.title)}" aria-label="Subtask" />
          <button type="button" class="mv-sdel" data-mv="sub-del" data-id="${t.id}" data-sid="${s.id}" aria-label="Remove subtask" title="Remove">✕</button>
        </div>`
      )
      .join("");
  }

  function viewRow(t, expanded) {
    const done = !!t.completed;
    const meta = chips(t);
    const completedMeta =
      done && t.completedAt ? `<div class="mv-meta"><span class="mv-chip">completed ${esc(U.relativeTime(t.completedAt))}</span></div>` : "";
    return `<li class="mv-row ${done ? "done" : ""}" data-id="${t.id}">
      <input type="checkbox" class="mv-check" data-mv="toggle" data-id="${t.id}" ${done ? "checked" : ""} aria-label="${done ? "Mark incomplete" : "Mark complete"}" />
      <div class="mv-body">
        <span class="mv-title" data-mv="title-view" data-id="${t.id}">${linkify(t.title)}</span>
        ${meta ? `<div class="mv-meta">${meta}</div>` : ""}
        ${completedMeta}
        ${!expanded && t.notes ? `<p class="mv-note-preview">${linkify(t.notes)}</p>` : ""}
        ${expanded ? detailView(t) : ""}
      </div>
      <button type="button" class="mv-expand ${expanded ? "open" : ""}" data-mv="expand" data-id="${t.id}" aria-label="Toggle details" title="Details">${I.chevron}</button>
      <button type="button" class="mv-edit-btn" data-mv="edit" data-id="${t.id}" aria-label="Edit task" title="Edit">${I.pencil}</button>
      <button type="button" class="mv-del" data-mv="del" data-id="${t.id}" aria-label="Delete task" title="Delete">${I.trash}</button>
    </li>`;
  }

  function editRow(t) {
    const done = !!t.completed;
    return `<li class="mv-row editing ${done ? "done" : ""}" data-id="${t.id}">
      <input type="checkbox" class="mv-check" data-mv="toggle" data-id="${t.id}" ${done ? "checked" : ""} aria-label="${done ? "Mark incomplete" : "Mark complete"}" />
      <div class="mv-body">
        <div class="mv-edit">
          <textarea class="mv-title-input" data-mv="title" data-id="${t.id}" rows="1" placeholder="Task title" aria-label="Task title">${esc(t.title)}</textarea>
          <textarea class="mv-notes" data-mv="notes" data-id="${t.id}" placeholder="Notes…" aria-label="Notes">${esc(t.notes || "")}</textarea>
          <div class="mv-drow">
            <label class="mv-field">Due<input type="date" class="mv-due" data-mv="due" data-id="${t.id}" value="${t.dueDate || ""}" aria-label="Due date" /></label>
            <label class="mv-field mv-url">Link<input type="url" class="mv-url-input" data-mv="url" data-id="${t.id}" value="${esc(t.url || "")}" placeholder="https://example.com" aria-label="Link" /></label>
          </div>
          <div class="mv-subs">
            ${subsEdit(t)}
            <div class="mv-subadd"><input type="text" class="mv-subinput" data-mv="sub-input" data-id="${t.id}" placeholder="Add subtask…" aria-label="Add subtask" /></div>
          </div>
          <div class="mv-edit-actions"><button type="button" class="mv-done" data-mv="done-edit" data-id="${t.id}">Done</button></div>
        </div>
      </div>
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

    const ui = { state: null, expanded: new Set(), editing: new Set(), completedOpen: false, focusEdit: null };

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

    function autosize(el) {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 320) + "px";
    }

    function rowFor(t) {
      return ui.editing.has(t.id) ? editRow(t) : viewRow(t, ui.expanded.has(t.id));
    }

    function render(state) {
      if (state) ui.state = state;
      if (!ui.state) return;

      const open = openTodos();
      const done = doneTodos();

      list.innerHTML = open.map(rowFor).join("");

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
      clist.innerHTML = done.map(rowFor).join("");
      clist.hidden = !ui.completedOpen;
      completedHead.setAttribute("aria-expanded", String(ui.completedOpen));

      root.querySelectorAll(".mv-title-input").forEach(autosize);

      if (ui.focusEdit) {
        const el = root.querySelector(`.mv-row[data-id="${ui.focusEdit}"] .mv-title-input`);
        const id = ui.focusEdit;
        ui.focusEdit = null;
        if (el) setTimeout(() => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 0);
      }
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
    function focusNew() { showForm(true); }

    function startEdit(id) {
      ui.editing.add(id);
      ui.focusEdit = id;
      render();
    }
    function endEdit(id) {
      ui.editing.delete(id);
      render();
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
      if (act === "edit") return startEdit(id);
      if (act === "done-edit") return endEdit(id);
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

    // double-click the title to edit
    root.addEventListener("dblclick", (e) => {
      const title = e.target.closest('[data-mv="title-view"]');
      if (title) startEdit(title.dataset.id);
    });

    root.addEventListener("input", (e) => {
      const el = e.target.closest(".mv-title-input");
      if (el) autosize(el);
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
      } else if (act === "url") {
        ctx.dispatch("todo:update", { id, patch: { url: el.value.trim() || null } });
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
      if (act === "title" && e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      } else if (act === "title" && e.key === "Escape") {
        e.preventDefault();
        endEdit(el.dataset.id);
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
