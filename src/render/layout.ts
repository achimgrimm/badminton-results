import { CLUB_NAME, REPO_URL, SEASON_LABEL, UMAMI_DOMAIN, UMAMI_SCRIPT, UMAMI_WEBSITE_ID, urls } from "../config.ts";
import type { ClubTeam } from "../types.ts";
import { buildVersion, clubTeams, currentTeam, releaseNotes } from "./context.ts";
import { esc, formatDate, formatTimestamp, html, todayInBremen } from "./util.ts";

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
  /** Spielbericht pages: the meeting shown, so its "Neu" marker is cleared */
  meeting?: number;
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

/** A result counts as new for this long after the device first saw it. */
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * Marks the selected team's results that are new on this device: the first time a result card
 * shows up, its key is stored with the time; for a day after that it gets a "Neu" badge.
 * On the first visit to a team everything is recorded as already seen, so a whole season isn't new.
 * Opening a Spielbericht clears its marker. Results first seen on this page load are also listed
 * in a dialog, once.
 */
const NEW_RESULTS = (slug: string) => `(function () {
  var KEY = "seen-${slug}", seen = null, now = Date.now();
  try { seen = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  var first = !seen || typeof seen !== "object";
  if (first) seen = {};
  var read = document.body.dataset.meeting;
  if (read) seen[read] = 0;
  var fresh = [];
  document.querySelectorAll(".match-card[data-result-key]").forEach(function (card) {
    var k = card.dataset.resultKey;
    if (!(k in seen)) {
      seen[k] = first ? 0 : now;
      if (!first) fresh.push(card);
    }
    if (seen[k] && now - seen[k] < ${NEW_FOR_MS}) {
      card.classList.add("is-new");
      var b = document.createElement("span");
      b.className = "badge badge--new";
      b.textContent = "Neu";
      card.querySelector(".badges").prepend(b);
    }
  });
  try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {}
  if (fresh.length) popup(fresh);

  function popup(cards) {
    var dlg = document.getElementById("new-dialog"), list = dlg.querySelector(".team-list");
    dlg.querySelector("h2").textContent = cards.length === 1 ? "Neues Ergebnis" : cards.length + " neue Ergebnisse";
    cards.forEach(function (card) {
      var item = document.createElement(card.href ? "a" : "div"), text = document.createElement("span");
      if (card.href) item.href = card.href;
      text.className = "team-label";
      text.textContent = card.dataset.resultText;
      var side = document.createElement("span"), outcome = card.querySelector(".badge--win, .badge--draw, .badge--loss");
      side.className = "small muted";
      side.textContent = card.dataset.resultDate + " ";
      if (outcome) side.appendChild(outcome.cloneNode(true));
      item.append(text, side);
      var li = document.createElement("li");
      li.appendChild(item);
      list.appendChild(li);
    });
    dlg.querySelectorAll(".dialog-close, .btn").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
    otTrack("new-results", { count: cards.length });
  }
})();`;

/**
 * "Ich spiele": the user marks own matches they play in. Stored per team and season as a list of
 * previewName keys (stable across postponements and after the result). Every own card with that key
 * gets a "Dabei" badge, toggles show their state, and Spielplan days with a marked match get
 * "has-mine" for the "Meine Spiele" filter. Must run before the page script.
 */
const PLAYING = (slug: string) => `(function () {
  var KEY = "playing-${slug}-${SEASON_LABEL.replace(/[^0-9a-z]+/gi, "-")}", mine = [];
  try { mine = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) {}
  if (!Array.isArray(mine)) mine = [];
  function has(k) { return mine.indexOf(k) >= 0; }
  function render() {
    var any = false;
    document.querySelectorAll(".match-card[data-play-key]").forEach(function (card) {
      var on = has(card.dataset.playKey), badge = card.querySelector(".badge--playing");
      card.classList.toggle("is-playing", on);
      if (on) any = true;
      if (on && !badge) {
        badge = document.createElement("span");
        badge.className = "badge badge--playing";
        badge.textContent = "Dabei";
        card.querySelector(".badges").prepend(badge);
      } else if (!on && badge) badge.remove();
    });
    document.querySelectorAll(".play-toggle").forEach(function (b) {
      var on = has(b.dataset.playKey);
      b.setAttribute("aria-pressed", String(on));
      b.querySelector("span").textContent = on ? "Dabei" : "Ich spiele";
    });
    document.querySelectorAll(".day").forEach(function (day) {
      day.classList.toggle("has-mine", !!day.querySelector(".match-card.is-playing"));
    });
    document.body.classList.toggle("no-playing", !any);
  }
  document.querySelectorAll(".play-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.playKey, on = !has(k);
      if (on) mine.push(k); else mine = mine.filter(function (x) { return x !== k; });
      try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {}
      render();
      otTrack("playing", { on: on });
    });
  });
  render();
})();`;

/** How many of the newest release notes each page carries. */
const RELEASES_SHOWN = 3;
const RELEASE_KEY = "releaseSeen";

/**
 * Release notes dialog. The footer link opens it with all embedded notes. On team pages it opens
 * by itself with the notes newer than the last one seen; new users (no team chosen yet) skip
 * those and start from the newest. "Seen" is stored when the dialog is closed. If the new-results
 * pop-up is open, the notes wait until it is closed. Must run before REMEMBER sets the team key.
 */
const RELEASE_NOTES = (auto: boolean) => `(function () {
  var dlg = document.getElementById("release-dialog");
  if (!dlg) return;
  var arts = Array.prototype.slice.call(dlg.querySelectorAll("[data-release]"));
  var newest = arts[0].dataset.release, seen = null, known = null;
  try { seen = localStorage.getItem("${RELEASE_KEY}"); known = localStorage.getItem("${TEAM_KEY}"); } catch (e) {}
  function show(list, via) {
    arts.forEach(function (a) { a.hidden = list.indexOf(a) < 0; });
    dlg.showModal();
    otTrack("release-notes", { id: newest, via: via });
  }
  // Saved right away on a click too: the close event fires a moment later, possibly after a reload.
  function done() { try { localStorage.setItem("${RELEASE_KEY}", newest); } catch (e) {} dlg.close(); }
  dlg.querySelectorAll(".dialog-close, .btn").forEach(function (b) { b.addEventListener("click", done); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) done(); });
  dlg.addEventListener("close", function () { try { localStorage.setItem("${RELEASE_KEY}", newest); } catch (e) {} });
  document.getElementById("release-link").addEventListener("click", function (e) { e.preventDefault(); show(arts, "footer"); });
  if (!${auto}) return;
  if (!seen && !known) { try { localStorage.setItem("${RELEASE_KEY}", newest); } catch (e) {} return; }
  var fresh = arts.filter(function (a) { return !seen || a.dataset.release > seen; });
  if (!fresh.length) return;
  // Runs after the other page scripts, so an open new-results pop-up goes first.
  setTimeout(function () {
    var other = document.getElementById("new-dialog");
    if (other && other.open) other.addEventListener("close", function () { show(fresh, "auto"); }, { once: true });
    else show(fresh, "auto");
  }, 0);
})();`;

function releaseDialog(): string {
  const shown = releaseNotes().slice(0, RELEASES_SHOWN);
  if (!shown.length) return "";
  return html`<dialog class="team-dialog release-dialog" id="release-dialog" aria-labelledby="release-dialog-h">
  <div class="dialog-head">
    <h2 id="release-dialog-h">Was ist neu?</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  ${shown.map(
    (r) => html`<article data-release="${esc(r.id)}">
      <h3>${esc(r.title)}</h3>
      <p class="small muted">${esc(formatDate(r.date))}</p>
      ${r.html}
    </article>`,
  )}
  <div class="btn-row"><button type="button" class="btn btn-primary" autofocus>OK</button></div>
</dialog>`;
}

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

/**
 * Loads Umami (cookieless) and tags every page view and event "app" or "browser", so the
 * dashboard can filter by installed PWA. otTrack() is a no-op until the script has loaded
 * or when it is blocked.
 */
const ANALYTICS = `function otTrack(name, data) { if (window.umami) umami.track(name, data); }
(function () {
  var s = document.createElement("script");
  var app = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  s.defer = true;
  s.src = "${UMAMI_SCRIPT}";
  s.dataset.websiteId = "${UMAMI_WEBSITE_ID}";
  s.dataset.domains = "${UMAMI_DOMAIN}";
  s.dataset.tag = app ? "app" : "browser";
  document.head.appendChild(s);
})();`;
const TRACKING = UMAMI_WEBSITE_ID !== "";
/** Stub when tracking is off, so the other scripts can call otTrack() unconditionally. */
const NO_ANALYTICS = `function otTrack() {}`;

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
    otTrack("theme", { to: root.dataset.theme });
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
    document.querySelectorAll(".open-in-chrome").forEach(function (a) {
      a.href = intent;
      a.addEventListener("click", function () { otTrack("open-in-chrome"); });
    });
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
      otTrack(choice.outcome === "accepted" ? "install-accepted" : "install-dismissed");
      if (choice.outcome === "accepted") btn.hidden = true;
    });
  }
  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; btn.hidden = false; });
  addEventListener("appinstalled", function () { deferred = null; btn.hidden = true; otTrack("app-installed"); });
  btn.addEventListener("click", function () {
    otTrack("install-click", { platform: otherAndroid ? "android-other" : deferred ? "prompt" : ios ? "ios" : "other" });
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
      otTrack("share", { method: navigator.share ? "share" : navigator.clipboard ? "clipboard" : "prompt" });
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

/** Filled and opened by NEW_RESULTS when results appeared since the last visit. */
const NEW_DIALOG = html`<dialog class="team-dialog new-dialog" id="new-dialog" aria-labelledby="new-dialog-h">
  <div class="dialog-head">
    <h2 id="new-dialog-h">Neue Ergebnisse</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  <ul class="team-list"></ul>
  <div class="btn-row"><button type="button" class="btn btn-primary" autofocus>OK</button></div>
</dialog>`;

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

/** "Stand: <data timestamp> · Version <commit> vom <commit date> · Was ist neu?", whichever parts are known. */
function footerStatus(checkedAt: string | null): string {
  const v = buildVersion();
  const parts = [
    checkedAt ? `Stand: ${esc(formatTimestamp(checkedAt))}` : "",
    v ? `Version <a href="${REPO_URL}/commit/${esc(v.sha)}">${esc(v.sha.slice(0, 7))}</a> vom ${todayInBremen(new Date(v.date)).split("-").reverse().join(".")}` : "",
  ].filter(Boolean);
  if (releaseNotes().length) parts.push(`<a href="#" id="release-link">Was ist neu?</a>`);
  return parts.length ? `<p>${parts.join(" · ")}</p>` : "";
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
<script>${TRACKING ? ANALYTICS : NO_ANALYTICS}</script>
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
<body${o.meeting ? ` data-meeting="${o.meeting}"` : ""}>
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
    ${TRACKING ? `<p>Anonyme Nutzungsstatistik mit Umami, ohne Cookies und ohne persönliche Daten.</p>` : ""}
    ${footerStatus(o.checkedAt)}
  </div>
</footer>
${team ? teamDialog(team, assets) : ""}
${team ? NEW_DIALOG : ""}
${releaseDialog()}
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
${releaseNotes().length ? `<script>${RELEASE_NOTES(team != null)}</script>` : ""}
${team ? `<script>${REMEMBER(team.slug)}${TEAM_SWITCH}${NEW_RESULTS(team.slug)}${PLAYING(team.slug)}</script>` : ""}
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>
`;
}
