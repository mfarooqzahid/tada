/* Tada — the extension's "Options" entry point.
 *
 * Settings live inside the app now, so this page simply replaces itself with
 * the dashboard's settings view (same tab, same theme).
 */
location.replace(chrome.runtime.getURL("src/dashboard/dashboard.html") + "#settings");
