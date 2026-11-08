import { layout } from "./layout.ts";

/**
 * Where Google sign-in returns to (the only redirect URL Supabase needs per site). The script in
 * online.js finishes the login from the URL; then this page sends the visitor back to the page
 * they started from (kept in sessionStorage by Online.signIn), or to the site root.
 */
const FINISH = `window.addEventListener("load", function () {
  var msg = document.getElementById("auth-msg");
  function fail(text) { msg.textContent = text; document.getElementById("auth-home").hidden = false; }
  var params = new URLSearchParams(location.search);
  if (params.get("error") || params.get("error_description")) { fail("Die Anmeldung ist fehlgeschlagen. Bitte versuche es noch einmal."); return; }
  var done = false;
  function go() {
    if (done) return;
    done = true;
    var ret = null, url = null;
    try { ret = sessionStorage.getItem("auth-return"); sessionStorage.removeItem("auth-return"); } catch (e) {}
    try { url = new URL(ret, location.href); if (url.origin !== location.origin) url = null; } catch (e) {}
    location.replace(url ? url.href : "index.html");
  }
  if (!window.Online) { fail("Die Anmeldung ist hier nicht verfügbar."); return; }
  window.Online.onChange(function (s) { if (s) go(); });
  setTimeout(function () { if (!done) fail("Die Anmeldung hat zu lange gedauert. Bitte versuche es noch einmal."); }, 10000);
});`;

export function renderAuthCallback(): string {
  const body = `<h1>Anmeldung</h1>
    <p id="auth-msg">Du wirst angemeldet …</p>
    <p><a id="auth-home" class="btn btn-primary" href="index.html" hidden>Zur Startseite</a></p>`;
  return layout({ title: "Anmeldung", root: "", assets: "", nav: null, checkedAt: null, body, script: FINISH, noindex: true });
}
