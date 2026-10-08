/*!
 * Tada — on-page overlay.
 *
 * No corner button. Press Ctrl+N (or Cmd+N) on any page to open a centered,
 * accessible quick-list overlay. Also reachable from the toolbar popup and the
 * extension keyboard command. Everything lives in a Shadow DOM with a
 * constructed stylesheet so the host page cannot affect it.
 */
(function () {
  "use strict";

  if (globalThis.__tadaOverlayLoaded) return;
  globalThis.__tadaOverlayLoaded = true;

  const T = globalThis.Tada;
  const U = T.util;

  const state = {
    data: null,
    open: false,
    mounted: false,
    host: null,
    shadow: null,
    dialog: null,
    view: null,
    lastFocus: null,
  };

  const OVERLAY_CSS = `
    :host {
      all: initial;
      --bg: #ffffff;
      --surface: #ffffff;
      --fg: #1b1e28;
      --muted: #6b7280;
      --muted-2: #9aa1ad;
      --border: #e7e9f2;
      --border-soft: #eff1f7;
      --border-strong: #cdd4e6;
      --soft: #f6f7fb;
      --accent: #5b6cff;
      --accent-2: #9a6cff;
      --accent-soft: rgba(91, 108, 255, .12);
      --accent-ring: rgba(91, 108, 255, .22);
      --danger: #e5484d;
      --row-hover: rgba(27, 30, 40, .035);
    }
    .wrap {
      position: fixed; inset: 0; z-index: 2147483647;
      display: flex; align-items: flex-start; justify-content: center;
      padding: max(9vh, 56px) 16px 24px;
      overflow-y: auto;
      background: rgba(20, 23, 34, .38);
      -webkit-backdrop-filter: blur(7px) saturate(120%);
      backdrop-filter: blur(7px) saturate(120%);
      animation: fade .14s ease;
    }
    @keyframes fade { from { opacity: 0 } }
    @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.985) } }
    .panel {
      width: 100%; max-width: 580px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 22px;
      box-shadow: 0 44px 90px -30px rgba(10, 14, 30, .58), 0 10px 28px -14px rgba(10, 14, 30, .35);
      padding: 20px 22px 24px;
      color: var(--fg);
      animation: pop .16s ease;
    }
    .bar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .logo { display: flex; align-items: center; gap: 9px; font-weight: 750; font-size: 15px; letter-spacing: -0.01em; }
    .logo .mark {
      width: 26px; height: 26px; border-radius: 9px;
      display: flex; align-items: center; justify-content: center; color: #fff;
      background: linear-gradient(140deg, var(--accent), var(--accent-2));
      box-shadow: 0 8px 18px -8px var(--accent);
    }
    .bar .count {
      color: var(--muted); font-size: 12px; font-weight: 600;
      background: var(--soft); border: 1px solid var(--border-soft);
      padding: 4px 10px; border-radius: 999px;
    }
    .bar .spacer { flex: 1; }
    .bar .open, .bar .close {
      font-size: 13px; font-weight: 600; color: var(--muted);
      padding: 7px 11px; border-radius: 10px; display: flex; align-items: center; gap: 6px;
      transition: background .14s, color .14s;
    }
    .bar .open:hover, .bar .close:hover { background: var(--soft); color: var(--fg); }
    .bar .close { width: 34px; height: 34px; justify-content: center; padding: 0; font-size: 14px; }
    .bar button:focus-visible { outline: none; box-shadow: 0 0 0 4px var(--accent-ring); }
  `;

  function newHost() {
    const host = document.createElement("div");
    host.id = "tada-overlay-host";
    host.style.cssText = "all:initial;";
    const shadow = host.attachShadow({ mode: "open" });

    try {
      if (typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(OVERLAY_CSS + T.MINI_CSS);
        shadow.adoptedStyleSheets = [sheet];
      } else {
        throw new Error("no constructable stylesheets");
      }
    } catch (_) {
      const style = document.createElement("style");
      style.textContent = OVERLAY_CSS + T.MINI_CSS;
      shadow.appendChild(style);
    }
    return { host, shadow };
  }

  function build() {
    if (state.mounted) return;
    const { host, shadow } = newHost();
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.innerHTML = `
      <div class="panel" role="dialog" aria-modal="true" aria-label="Tada — task list">
        <div class="bar">
          <span class="logo">
            <span class="mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </span>
            Tada
          </span>
          <span class="count" data-count></span>
          <span class="spacer"></span>
          <button type="button" class="open" data-open>Open dashboard</button>
          <button type="button" class="close" data-close aria-label="Close">✕</button>
        </div>
        <div data-view></div>
      </div>`;
    shadow.appendChild(wrap);
    document.documentElement.appendChild(host);

    state.host = host;
    state.shadow = shadow;
    state.dialog = wrap.querySelector(".panel");
    state.view = T.miniView.create(wrap.querySelector("[data-view]"), {
      getState: () => state.data,
      dispatch: (a, p) => T.api.dispatch(a, p),
      showToast: null,
    });

    wrap.addEventListener("mousedown", (e) => {
      if (e.target === wrap) close();
    });
    wrap.querySelector("[data-close]").addEventListener("click", close);
    wrap.querySelector("[data-open]").addEventListener("click", () => {
      T.api.openDashboard();
      close();
    });

    state.mounted = true;
  }

  function render() {
    if (!state.mounted || !state.data) return;
    const wrap = state.shadow.querySelector(".wrap");
    const count = U.countActive(state.data.todos);
    wrap.querySelector("[data-count]").textContent = count ? `${count} left` : "all done";
    state.view.render(state.data);
  }

  function enabled() {
    return !!(state.data && state.data.settings.widgetEnabled && !muted());
  }

  function muted() {
    if (!state.data) return false;
    const list = state.data.settings.mutedSites || [];
    const full = location.hostname;
    const bare = full.replace(/^www\./, "");
    return list.some((s) => s === full || s === bare || full === s || full.endsWith("." + s));
  }

  function focusables() {
    return Array.from(
      state.dialog.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  function open(focusInput) {
    if (!enabled()) return false;
    build();
    state.lastFocus = document.activeElement;
    state.host.style.display = "";
    render();
    state.open = true;
    setTimeout(() => {
      if (focusInput) state.view.focusNew();
      else {
        const f = focusables()[0];
        if (f) f.focus();
      }
    }, 20);
    return true;
  }

  function close() {
    if (!state.mounted) return;
    state.host.style.display = "none";
    state.open = false;
    if (state.lastFocus && state.lastFocus.focus) {
      try { state.lastFocus.focus(); } catch (_) {}
    }
  }

  function toggle() {
    if (state.open) close();
    else open(false);
  }

  /* ------------------------------------------------------------- keyboard */

  function onKeydown(e) {
    // Ctrl/Cmd+N — best effort (Chrome may reserve it at browser level).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "n" || e.key === "N")) {
      if (!enabled()) return;
      e.preventDefault();
      e.stopPropagation();
      open(true);
      return;
    }
    if (!state.open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Tab") {
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = state.shadow.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /* ---------------------------------------------------------------- init */

  async function init() {
    try {
      state.data = await T.api.getState();
    } catch (_) {
      return;
    }
    if (!state.data || state.data.error) return;

    window.addEventListener("keydown", onKeydown, true);

    T.api.subscribe((next) => {
      state.data = next;
      if (!enabled()) {
        close();
        return;
      }
      if (state.open) render();
    });

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || typeof msg.type !== "string") return undefined;
      if (msg.type === "tada:toggle-widget") {
        toggle();
        sendResponse && sendResponse({ ok: true });
      } else if (msg.type === "tada:quick-add") {
        open(true);
        sendResponse && sendResponse({ ok: true });
      }
      return undefined;
    });
  }

  if (document.documentElement) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
