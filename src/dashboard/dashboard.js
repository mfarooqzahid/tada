/* Tada — minimal dashboard controller (list + in-app settings). */
(function () {
  "use strict";

  const T = globalThis.Tada;
  const U = T.util;

  let data = null;
  let query = "";
  let view = null;
  let toastTimer = null;

  const $ = (s) => document.querySelector(s);

  function injectMiniCss() {
    if (document.getElementById("tada-mini-css")) return;
    const style = document.createElement("style");
    style.id = "tada-mini-css";
    style.textContent = T.MINI_CSS;
    document.head.appendChild(style);
  }

  /* --------------------------------------------------------------- toast */
  function showToast(message, undo) {
    const el = $("#toast");
    $("#toast-msg").textContent = message;
    const btn = $("#toast-action");
    if (undo) {
      btn.hidden = false;
      btn.textContent = "Undo";
      btn.onclick = () => { undo(); hideToast(); };
    } else {
      btn.hidden = true;
      btn.onclick = null;
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 7000 : 3000);
  }
  function hideToast() { $("#toast").hidden = true; }

  /* -------------------------------------------------------------- routing */
  function mode() {
    return location.hash.replace(/^#\/?/, "") === "settings" ? "settings" : "list";
  }
  function goSettings() { location.hash = "#settings"; }
  function goList() { location.hash = ""; }

  /* --------------------------------------------------------------- render */
  function render() {
    if (!data) return;
    const settings = mode() === "settings";
    $("#main").hidden = settings;
    $("#settings").hidden = !settings;
    $("#options").setAttribute("aria-pressed", String(settings));
    $("#search").style.display = settings ? "none" : "";

    if (settings) {
      renderSettings();
    } else {
      const open = U.countActive(data.todos);
      $("#count").textContent = open ? `${open} left` : "all done";
      $("#count").style.display = "";
      document.title = open ? `(${open}) Tada` : "Tada";
      view.render(data);
    }
  }

  /* ------------------------------------------------------------- settings */
  function mutedSites() {
    return (data.settings.mutedSites || []).slice();
  }

  function renderSettings() {
    const el = $("#settings");
    el.innerHTML = `
      <div class="set-head">
        <button class="backbtn" id="settings-back" aria-label="Back to list">←</button>
        <h2>Settings</h2>
      </div>

      <div class="set-group">
        <h3>Appearance</h3>
        <div class="set-row">
          <span class="lbl"><b>Theme</b><span>Light, dark, or match your system.</span></span>
          <select id="s-theme"><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select>
        </div>
      </div>

      <div class="set-group">
        <h3>On-page quick list</h3>
        <div class="set-row">
          <span class="lbl"><b>Enable on web pages</b><span>Press Ctrl+N on any page for a centered task list.</span></span>
          <label class="sw"><input type="checkbox" id="s-widget" /><span></span></label>
        </div>
        <div class="set-row">
          <span class="lbl"><b>Toolbar badge</b><span>Show the number of open tasks on the icon.</span></span>
          <label class="sw"><input type="checkbox" id="s-badge" /><span></span></label>
        </div>
        <div class="set-col">
          <span class="lbl"><b>Hidden sites</b><span>The quick list won't open on these sites.</span></span>
          <div class="site-add">
            <input id="s-siteinput" type="text" placeholder="example.com" aria-label="Site to hide" />
            <button class="btn2" id="s-siteadd">Add</button>
          </div>
          <div class="site-list" id="s-sites"></div>
        </div>
      </div>

      <div class="set-group">
        <h3>Behaviour</h3>
        <div class="set-row">
          <span class="lbl"><b>Confirm before deleting</b><span>Ask before a task is removed.</span></span>
          <label class="sw"><input type="checkbox" id="s-confirm" /><span></span></label>
        </div>
        <div class="set-row">
          <span class="lbl"><b>Keep deleted tasks for</b><span>How long trashed tasks stay restorable.</span></span>
          <select id="s-trash">
            <option value="0">Forever</option>
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </div>
      </div>

      <div class="set-group">
        <h3>Your data</h3>
        <p class="set-usage" id="s-usage">Calculating…</p>
        <div class="set-btns">
          <button class="btn2" id="s-export">Export backup</button>
          <button class="btn2" id="s-import-btn">Import backup</button>
          <input type="file" id="s-import" accept="application/json" hidden />
          <button class="btn2 danger" id="s-reset">Reset everything</button>
        </div>
      </div>

      <p class="set-note">
        <kbd>Ctrl</kbd>+<kbd>N</kbd> quick list · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>U</kbd> new task ·
        Chrome reserves <kbd>Ctrl</kbd>+<kbd>N</kbd>, so the toolbar popup works too.
      </p>`;

    $("#s-theme").value = data.settings.theme || "light";
    $("#s-widget").checked = !!data.settings.widgetEnabled;
    $("#s-badge").checked = !!data.settings.badgeEnabled;
    $("#s-confirm").checked = !!data.settings.confirmDelete;
    $("#s-trash").value = String(data.settings.autoPurgeTrashDays ?? 30);
    renderSites();
    renderUsage();
  }

  function renderSites() {
    const wrap = $("#s-sites");
    const sites = mutedSites();
    if (!sites.length) {
      wrap.innerHTML = `<span class="site-empty">Available on all sites.</span>`;
      return;
    }
    wrap.innerHTML = sites
      .map((s) => `<span class="site-pill">${U.escapeHtml(s)}<button data-site-remove="${U.escapeHtml(s)}" aria-label="Unhide ${U.escapeHtml(s)}">✕</button></span>`)
      .join("");
  }

  async function renderUsage() {
    try {
      const bytes = await chrome.storage.local.getBytesInUse(null);
      const n = data.todos.filter((t) => !t.deletedAt).length;
      $("#s-usage").textContent = `${(bytes / 1024).toFixed(1)} KB stored · ${n} task${n === 1 ? "" : "s"}. Data lives in your browser.`;
    } catch (_) {
      $("#s-usage").textContent = "Stored locally in your browser.";
    }
  }

  function setSetting(patch, applyTheme) {
    if (applyTheme) T.applyTheme(patch.theme);
    T.api.dispatch("settings:update", { patch, silent: true });
  }

  function addSite() {
    const el = $("#s-siteinput");
    const site = el.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!site) return;
    const list = mutedSites();
    if (!list.includes(site)) list.push(site);
    setSetting({ mutedSites: list });
    el.value = "";
  }

  /* ---------------------------------------------------------------- bind */
  function isTyping(el) {
    return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  function bind() {
    $("#search").addEventListener("input", (e) => {
      query = e.target.value;
      if (mode() === "list") view.render(data);
    });

    $("#options").addEventListener("click", () => (mode() === "settings" ? goList() : goSettings()));

    // settings interactions (delegated — the panel is re-rendered)
    const st = $("#settings");
    st.addEventListener("click", (e) => {
      if (e.target.closest("#settings-back")) return goList();
      const rm = e.target.closest("[data-site-remove]");
      if (rm) return setSetting({ mutedSites: mutedSites().filter((s) => s !== rm.dataset.siteRemove) });
      if (e.target.closest("#s-siteadd")) return addSite();
      if (e.target.closest("#s-export")) {
        const stamp = new Date().toISOString().slice(0, 10);
        U.download(`tada-backup-${stamp}.json`, JSON.stringify(data, null, 2));
        return showToast("Backup downloaded");
      }
      if (e.target.closest("#s-import-btn")) return $("#s-import").click();
      if (e.target.closest("#s-reset")) {
        if (!confirm("Reset Tada? This deletes all tasks and history. This cannot be undone.")) return;
        if (!confirm("Are you absolutely sure? Consider exporting a backup first.")) return;
        return T.api.dispatch("state:reset", {});
      }
    });

    st.addEventListener("change", (e) => {
      const t = e.target;
      if (t.id === "s-theme") setSetting({ theme: t.value }, true);
      else if (t.id === "s-widget") setSetting({ widgetEnabled: t.checked });
      else if (t.id === "s-badge") setSetting({ badgeEnabled: t.checked });
      else if (t.id === "s-confirm") setSetting({ confirmDelete: t.checked });
      else if (t.id === "s-trash") setSetting({ autoPurgeTrashDays: Number(t.value) });
      else if (t.id === "s-import") handleImport(t);
    });

    st.addEventListener("keydown", (e) => {
      if (e.target.id === "s-siteinput" && e.key === "Enter") {
        e.preventDefault();
        addSite();
      }
    });

    document.addEventListener("keydown", (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        if (mode() === "settings") goList();
        setTimeout(() => view.focusNew(), 0);
        return;
      }
      if (e.key === "/" && mode() === "list" && !isTyping(e.target)) {
        e.preventDefault();
        $("#search").focus();
      } else if (e.key === "Escape") {
        if (mode() === "settings") goList();
        else hideToast();
      }
    });

    window.addEventListener("hashchange", render);
  }

  async function handleImport(input) {
    const file = input.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.todos)) throw new Error("Not a Tada backup");
      if (confirm(`Import ${parsed.todos.length} tasks? This replaces your current data.`)) {
        await T.api.dispatch("state:import", { state: parsed });
        showToast("Backup imported");
      }
    } catch (err) {
      alert("Could not import this file: " + err.message);
    } finally {
      input.value = "";
    }
  }

  /* ---------------------------------------------------------------- init */
  async function init() {
    injectMiniCss();
    data = await T.api.getState();
    if (!data || data.error) {
      $("#main").innerHTML = '<p style="padding:40px 4px;color:var(--muted)">Could not load Tada data. Reopen the dashboard.</p>';
      return;
    }
    T.applyTheme(data.settings.theme || "light");

    view = T.miniView.create($("#main"), {
      getState: () => data,
      dispatch: (action, payload) => T.api.dispatch(action, payload),
      getQuery: () => query,
      showToast,
    });

    bind();
    render();

    T.api.subscribe((next) => {
      data = next;
      render();
    });
  }

  init();
})();
