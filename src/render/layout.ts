import { LEAGUE_NAME, OWN_TEAM, SEASON_LABEL, urls } from "../config.ts";
import { esc, formatTimestamp, html } from "./util.ts";

export type NavKey = "index" | "tabelle" | "spielplan" | null;

export interface PageOptions {
  title: string;
  /** Path prefix back to the site root, e.g. "" or "../" */
  root: string;
  nav: NavKey;
  checkedAt: string | null;
  sourceUrl?: string;
  body: string;
  script?: string;
}

const NAV: { key: Exclude<NavKey, null>; href: string; label: string }[] = [
  { key: "index", href: "index.html", label: "Übersicht" },
  { key: "tabelle", href: "tabelle.html", label: "Tabelle" },
  { key: "spielplan", href: "spielplan.html", label: "Spielplan" },
];

const THEME_KEY = "theme";

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

const MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

export function layout(o: PageOptions): string {
  return html`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a409f">
<title>${esc(o.title)} · ${esc(OWN_TEAM)}</title>
<script>${THEME_INIT}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${o.root}styles.css">
<link rel="icon" href="${o.root}favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="${o.root}index.html">
      <span class="brand-team">${esc(OWN_TEAM)}</span>
      <span class="brand-league">${esc(LEAGUE_NAME)} ${esc(SEASON_LABEL)}</span>
    </a>
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="Dunkles Design einschalten">${MOON}${SUN}</button>
  </div>
  <nav class="tabs" aria-label="Hauptnavigation">
    <div class="container tabs-inner">
      ${NAV.map(
        (n) => `<a href="${o.root}${n.href}"${n.key === o.nav ? ' aria-current="page"' : ""}>${n.label}</a>`,
      )}
    </div>
  </nav>
</header>
<main class="container">
${o.body}
</main>
<footer class="site-footer">
  <div class="container">
    <p>Inoffizielle Ansicht. Daten: <a href="${esc(o.sourceUrl ?? urls.groupPage())}">nuLiga</a> / Bremer Badminton-Verband.</p>
    ${o.checkedAt ? `<p>Stand: ${esc(formatTimestamp(o.checkedAt))}</p>` : ""}
  </div>
</footer>
<script>${THEME_TOGGLE}</script>
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>
`;
}
