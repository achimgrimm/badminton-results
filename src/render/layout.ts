import { CLUB_NAME, SEASON_LABEL, urls } from "../config.ts";
import type { ClubTeam } from "../types.ts";
import { clubTeams, currentTeam } from "./context.ts";
import { esc, formatTimestamp, html } from "./util.ts";

export type NavKey = "index" | "tabelle" | "spielplan" | "spieler" | null;

export interface PageOptions {
  title: string;
  /** Path prefix back to the team's folder, e.g. "" or "../" */
  root: string;
  /** Path prefix back to the site root with the shared assets; defaults to one level above root */
  assets?: string;
  nav: NavKey;
  checkedAt: string | null;
  sourceUrl?: string;
  /** Keep the page out of search engines (personal stats) */
  noindex?: boolean;
  body: string;
  script?: string;
}

const NAV: { key: Exclude<NavKey, null>; href: string; label: string }[] = [
  { key: "index", href: "index.html", label: "Übersicht" },
  { key: "tabelle", href: "tabelle.html", label: "Tabelle" },
  { key: "spielplan", href: "spielplan.html", label: "Spielplan" },
  { key: "spieler", href: "spieler.html", label: "Spieler" },
];

const THEME_KEY = "theme";
const HINT_KEY = "chromeHintDismissed";
export const TEAM_KEY = "team";

/** Team pages remember themselves, so the chooser can forward there next time. */
const REMEMBER = (slug: string) => `try { localStorage.setItem("${TEAM_KEY}", "${slug}"); } catch (e) {}`;

const TEAM_SWITCH = `(function () {
  var btn = document.getElementById("team-btn"), dlg = document.getElementById("team-dialog");
  if (!btn) return;
  btn.addEventListener("click", function () { dlg.showModal(); });
  dlg.querySelector(".dialog-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
})();`;

/** Youth teams after the adult ones, each in club order. */
export function teamGroups(teams: ClubTeam[]): [string, ClubTeam[]][] {
  const youth = (t: ClubTeam) => /jugend|schüler|schueler|mini/i.test(t.label);
  return ([["Erwachsene", teams.filter((t) => !youth(t))], ["Jugend", teams.filter(youth)]] as [string, ClubTeam[]][])
    .filter(([, list]) => list.length);
}

/** Runs in <head> before paint: applies the saved choice, else the system setting. */
const THEME_INIT = `(function () {
  var t = null;
  try { t = localStorage.getItem("${THEME_KEY}"); } catch (e) {}
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = t;
})();`;

const THEME_TOGGLE = `(function () {
  var root = document.documentElement, btn = document.getElementById("theme-toggle");
  function label() {
    var dark = root.dataset.theme === "dark";
    btn.setAttribute("aria-label", dark ? "Helles Design einschalten" : "Dunkles Design einschalten");
    btn.title = btn.getAttribute("aria-label");
    document.querySelector('meta[name="theme-color"]').content = dark ? "#0b1e45" : "#0a409f";
  }
  btn.addEventListener("click", function () {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("${THEME_KEY}", root.dataset.theme); } catch (e) {}
    label();
  });
  label();
})();`;

/**
 * Install button: Chrome/Edge/Android fire beforeinstallprompt; iOS Safari has no prompt,
 * so the button opens a short how-to instead. Hidden when already running as an app.
 * Android browsers other than Chrome (e.g. Samsung Internet) wrap the site in an outdated APK
 * that Play Protect blocks, so there a note and the button point to Chrome instead.
 */
const INSTALL = (root: string) => `(function () {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("${root}sw.js");
  var btn = document.getElementById("install-btn"), help = document.getElementById("install-help"), deferred = null;
  var helpAndroid = document.getElementById("install-help-android"), hint = document.getElementById("chrome-hint");
  var ua = navigator.userAgent;
  var standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var brands = navigator.userAgentData && navigator.userAgentData.brands;
  var chrome = /Chrome\\//.test(ua) && !/SamsungBrowser|EdgA|OPR|Firefox|YaBrowser|MiuiBrowser|UCBrowser|Vivaldi|DuckDuckGo|; wv\\)/.test(ua)
    && (!brands || brands.some(function (b) { return b.brand === "Google Chrome"; }));
  var otherAndroid = /Android/i.test(ua) && !chrome;
  if (standalone) { share(); return; }
  if (ios || otherAndroid) btn.hidden = false;
  if (otherAndroid) {
    var intent = "intent://" + location.host + location.pathname + location.search + "#Intent;scheme=https;package=com.android.chrome;end";
    document.querySelectorAll(".open-in-chrome").forEach(function (a) { a.href = intent; });
    var dismissed = false;
    try { dismissed = localStorage.getItem("${HINT_KEY}") === "1"; } catch (e) {}
    if (!dismissed) hint.hidden = false;
    hint.querySelector(".dialog-close").addEventListener("click", function () {
      hint.hidden = true;
      try { localStorage.setItem("${HINT_KEY}", "1"); } catch (e) {}
    });
  }
  var installHere = helpAndroid.querySelector(".install-here");
  function prompt() {
    deferred.prompt();
    deferred.userChoice.then(function (choice) {
      deferred = null;
      if (choice.outcome === "accepted") btn.hidden = true;
    });
  }
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; btn.hidden = false; });
  addEventListener("appinstalled", function () { deferred = null; btn.hidden = true; });
  btn.addEventListener("click", function () {
    if (otherAndroid) { installHere.hidden = !deferred; helpAndroid.showModal(); return; }
    if (!deferred) { help.showModal(); return; }
    prompt();
  });
  installHere.addEventListener("click", function () { helpAndroid.close(); if (deferred) prompt(); });
  help.querySelector("button").addEventListener("click", function () { help.close(); });
  helpAndroid.querySelector(".dialog-close").addEventListener("click", function () { helpAndroid.close(); });

  /** Installed app only: no browser UI is left to pass the link on. Shares the chooser at the root. */
  function share() {
    var sb = document.getElementById("share-btn"), label = sb.querySelector("span"), timer = null;
    var url = new URL("${root}", location.href).href;
    function copied(text) {
      label.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = "Teilen"; }, 2000);
    }
    sb.hidden = false;
    sb.addEventListener("click", function () {
      if (navigator.share) {
        navigator.share({ title: "${SHARE_TITLE}", text: "${SHARE_TEXT}", url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { copied("Link kopiert"); }, function () { prompt("Link zum Teilen:", url); });
      } else {
        prompt("Link zum Teilen:", url);
      }
    });
  }
})();`;

const SHARE_TITLE = "OT Badminton";
const SHARE_TEXT = `Tabellen, Spielpläne und Ergebnisse aller ${CLUB_NAME}-Badmintonmannschaften`;

const CHROME_NOTE = "Installiere die App am besten über Chrome. Andere Browser erzeugen eine veraltete App, vor der Android warnt.";

const INSTALL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`;
const SHARE_ICON = `<svg class="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Teilen"><path d="M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
/** The common three-node share symbol; SHARE_ICON above mimics Safari's own button for the iOS how-to. */
const SHARE_BTN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;

const MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const CHEVRON = `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

/** Dialog listing all club teams; the current one is marked. */
function teamDialog(team: ClubTeam, assets: string): string {
  return html`<dialog class="team-dialog" id="team-dialog" aria-labelledby="team-dialog-h">
  <div class="dialog-head">
    <h2 id="team-dialog-h">Mannschaft wählen</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  ${teamGroups(clubTeams()).map(
    ([heading, list]) => html`<h3>${heading}</h3>
      <ul class="team-list">
        ${list.map(
          (t) => html`<li><a href="${assets}${t.slug}/index.html"${t.slug === team.slug ? ' aria-current="page"' : ""}>
            <span class="team-label">${esc(t.label)}</span><span class="small muted">${esc(t.league)}</span>
          </a></li>`,
        )}
      </ul>`,
  )}
  <p class="small"><a href="${assets}index.html#auswahl">Alle Mannschaften im Überblick</a></p>
</dialog>`;
}

export function layout(o: PageOptions): string {
  const team = currentTeam();
  const assets = o.assets ?? `${o.root}../`;
  const brand = team
    ? html`<button type="button" class="brand brand-btn" id="team-btn" aria-haspopup="dialog" aria-label="Mannschaft wechseln, aktuell ${esc(team.label)}">
        <span class="brand-team">${esc(team.label)}${CHEVRON}</span>
        <span class="brand-league">${esc(team.league)} ${esc(SEASON_LABEL)}</span>
      </button>`
    : html`<a class="brand" href="${assets}index.html#auswahl">
        <span class="brand-team">${esc(CLUB_NAME)} Badminton</span>
        <span class="brand-league">Alle Mannschaften ${esc(SEASON_LABEL)}</span>
      </a>`;

  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a409f">
${o.noindex ? `<meta name="robots" content="noindex">\n` : ""}<title>${esc(o.title)} · ${esc(team ? `${CLUB_NAME} ${team.label}` : `${CLUB_NAME} Badminton`)}</title>
<script>${THEME_INIT}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${assets}styles.css">
<link rel="icon" href="${assets}favicon.svg" type="image/svg+xml">
<link rel="manifest" href="${assets}manifest.webmanifest">
<link rel="apple-touch-icon" href="${assets}icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="OT Badminton">
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <img class="club-logo" src="${assets}club-logo.png" alt="TSV Osterholz-Tenever" width="40" height="40">
    ${brand}
    <div class="header-actions">
      <button type="button" class="header-btn install-btn" id="install-btn" aria-label="App installieren" title="App installieren" hidden>${INSTALL_ICON}<span>App</span></button>
      <button type="button" class="header-btn share-btn" id="share-btn" aria-label="App teilen" title="App teilen" hidden>${SHARE_BTN_ICON}<span>Teilen</span></button>
      <button type="button" class="header-btn theme-toggle" id="theme-toggle" aria-label="Dunkles Design einschalten">${MOON}${SUN}</button>
    </div>
  </div>
  ${team
    ? html`<nav class="tabs" aria-label="Hauptnavigation">
        <div class="container tabs-inner">
          ${NAV.map(
            (n) => `<a href="${o.root}${n.href}"${n.key === o.nav ? ' aria-current="page"' : ""}>${n.label}</a>`,
          )}
        </div>
      </nav>`
    : ""}
</header>
<div class="container chrome-hint-wrap">
  <div class="chrome-hint" id="chrome-hint" role="note" hidden>
    <p>${CHROME_NOTE}</p>
    <a class="btn btn-primary open-in-chrome" href="#">In Chrome öffnen</a>
    <button type="button" class="dialog-close" aria-label="Hinweis schließen">×</button>
  </div>
</div>
<main class="container">
${o.body}
</main>
<footer class="site-footer">
  <div class="container">
    <p>Inoffizielle Ansicht. Daten: <a href="${esc(o.sourceUrl ?? (team ? urls.groupPage(team) : urls.clubTeams()))}">nuLiga</a> / Bremer Badminton-Verband.</p>
    ${o.checkedAt ? `<p>Stand: ${esc(formatTimestamp(o.checkedAt))}</p>` : ""}
  </div>
</footer>
${team ? teamDialog(team, assets) : ""}
<dialog class="install-help" id="install-help" aria-labelledby="install-help-h">
  <h2 id="install-help-h">App installieren</h2>
  <p>So legst Du die Seite als App auf Deinen Home-Bildschirm:</p>
  <ol>
    <li>Tippe in Safari auf <b>Teilen</b> ${SHARE_ICON}</li>
    <li>Wähle <b>„Zum Home-Bildschirm“</b>.</li>
    <li>Tippe auf <b>„Hinzufügen“</b>.</li>
  </ol>
  <button type="button" class="btn btn-primary">Verstanden</button>
</dialog>
<dialog class="install-help" id="install-help-android" aria-labelledby="install-help-android-h">
  <div class="dialog-head">
    <h2 id="install-help-android-h">App installieren</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  <p>${CHROME_NOTE}</p>
  <div class="btn-row">
    <a class="btn btn-primary open-in-chrome" href="#">In Chrome öffnen</a>
    <button type="button" class="btn btn-secondary install-here" hidden>Trotzdem hier installieren</button>
  </div>
</dialog>
<script>${THEME_TOGGLE}</script>
<script>${INSTALL(assets)}</script>
${team ? `<script>${REMEMBER(team.slug)}${TEAM_SWITCH}</script>` : ""}
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>
`;
}
