import { ROLE_LABELS } from "../roles.ts";
import { CLUB_NAME, ONLINE, PRIVACY_CONTACT, REPO_URL, SIGNAL_URL, SEASON_KEY, SEASON_LABEL, STAGE, storageKey, SUPABASE_URL, UMAMI_DOMAIN, UMAMI_SCRIPT, UMAMI_WEBSITE_ID, urls } from "../config.ts";
import type { ClubTeam } from "../types.ts";
import { PLAYING_STATE } from "../playing.ts";
import { APP_SHORT_NAME } from "./pwa.ts";
import { buildVersion, clubTeams, currentTeam, onlineHref, releaseNotes, rosterEntries, stylesHref } from "./context.ts";
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
  /** Detail pages: link back to the list they belong to, above the content */
  back?: { href: string; label: string };
  /** Spielbericht pages: the meeting shown, so its "Neu" marker is cleared */
  meeting?: number;
}

const NAV: { key: Exclude<NavKey, null>; href: string; label: string }[] = [
  { key: "index", href: "index.html", label: "Übersicht" },
  { key: "tabelle", href: "tabelle.html", label: "Tabelle" },
  { key: "spielplan", href: "spielplan.html", label: "Spielplan" },
  { key: "spieler", href: "spieler.html", label: "Spieler" },
];

const THEME_KEY = storageKey("theme");
const HINT_KEY = storageKey("chromeHintDismissed");
export const TEAM_KEY = storageKey("team");

/** Team pages remember themselves, so the chooser can forward there next time. */
const REMEMBER = (slug: string) => `try { localStorage.setItem("${TEAM_KEY}", "${slug}"); } catch (e) {} otIdentify();`;

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
  var KEY = "${storageKey(`seen-${slug}`)}", seen = null, now = Date.now();
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
    dlg.querySelectorAll(".dialog-close, .btn-primary").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
    otTrack("new-results", { count: cards.length });
  }
})();`;

/** The chosen player ("Wer bist Du?"), per team and season; read by PLAYING, written by ME. */
const meKey = (slug: string) => storageKey(`me-${slug}-${SEASON_KEY}`);

/**
 * "Ich spiele": the user answers yes, maybe or no for own matches. Stored per team and season as an
 * object previewName -> state (stable across postponements and after the result); unanswered matches
 * have no entry (see PLAYING_STATE for the format and the migration of the old list). Yes cards get a
 * "Dabei" badge, maybe cards a "Vielleicht" badge, toggles show their state, and Spielplan days with a
 * yes or maybe match get "has-mine" for the "Meine Spiele" filter. Played matches whose Spielbericht
 * lists the chosen player (data-players, see ME) count as yes, answered or not. Must run before the page script.
 */
const PLAYING = (slug: string) => `(function () {
  ${PLAYING_STATE}
  var KEY = "${storageKey(`playing-${slug}-${SEASON_KEY}`)}", AT = "${storageKey(`answers-at-${slug}-${SEASON_KEY}`)}", mine = {};
  var STATUS = { "": "nicht angegeben", yes: "ja", maybe: "vielleicht", no: "nein" };
  var LABEL = { "": "Ich spiele", yes: "Dabei", maybe: "Vielleicht", no: "Kann nicht" };
  function load() {
    try { mine = migratePlaying(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch (e) { mine = {}; }
  }
  load();
  function me() {
    var m = null;
    try { m = JSON.parse(localStorage.getItem("${meKey(slug)}") || "null"); } catch (e) {}
    return m && m.person ? String(m.person) : null;
  }
  function badge(card, cls, text) {
    var b = card.querySelector(".badge--" + cls);
    if (text && !b) {
      b = document.createElement("span");
      b.className = "badge badge--" + cls;
      b.textContent = text;
      card.querySelector(".badges").prepend(b);
    } else if (!text && b) b.remove();
  }
  function render() {
    var any = false, person = me();
    document.querySelectorAll(".match-card[data-play-key]").forEach(function (card) {
      var played = person && (card.dataset.players || "").split(" ").indexOf(person) >= 0;
      var state = played ? "yes" : mine[card.dataset.playKey] || "";
      card.classList.toggle("is-playing", state === "yes");
      card.classList.toggle("is-maybe", state === "maybe");
      if (state === "yes" || state === "maybe") any = true;
      badge(card, "playing", state === "yes" ? "Dabei" : "");
      badge(card, "maybe", state === "maybe" ? "Vielleicht" : "");
    });
    document.querySelectorAll(".play-toggle").forEach(function (b) {
      var state = mine[b.dataset.playKey] || "";
      b.dataset.state = state;
      b.setAttribute("aria-label", b.dataset.label + " – Status: " + STATUS[state]);
      b.querySelector("span").textContent = LABEL[state];
    });
    document.querySelectorAll(".day").forEach(function (day) {
      day.classList.toggle("has-mine", !!day.querySelector(".match-card.is-playing, .match-card.is-maybe"));
    });
    document.body.classList.toggle("no-playing", !any);
    document.dispatchEvent(new Event("ot-playing"));
  }
  // online.js reloads the answers from storage after it merged the account's (see src/client/sync.ts).
  window.otPlayingRender = function () { load(); render(); };
  document.querySelectorAll(".play-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = b.dataset.playKey, state = nextPlaying(mine[k]);
      if (state) mine[k] = state; else delete mine[k];
      try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) {}
      // The time of each change, so that the newest answer wins when signed in (sync.ts); a cleared answer keeps its time.
      try {
        var at = JSON.parse(localStorage.getItem(AT) || "{}");
        at[k] = Date.now();
        localStorage.setItem(AT, JSON.stringify(at));
      } catch (e) {}
      render();
      document.dispatchEvent(new Event("ot-answers"));
      otTrack("playing", { state: state || "none" });
    });
  });
  render();
})();`;

/**
 * "Wer bist Du?": the user picks themselves from the team's players (Spieler page) or with
 * "Das bin ich" on a player page. Stored per team and season as { person, name }, on the device only.
 * Every element with the chosen data-person gets "is-me", its card "has-me". The Spieler page's
 * player list (alphabetical) starts with the chosen player.
 */
const ME = (slug: string, root: string) => `(function () {
  var KEY = "${meKey(slug)}", me = null, locked = false;
  try { me = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (!me || typeof me !== "object" || !me.person) me = null;
  var card = document.getElementById("me-card"), dlg = document.getElementById("me-dialog");
  var list = document.getElementById("player-list"), order = list ? Array.prototype.slice.call(list.children) : [];
  function save(next, via) {
    // Signed in (online.js), clearing the player instead asks for the new one; the pick stays until then.
    if (!next && via !== "account" && window.otClearMe && window.otClearMe()) return;
    me = next;
    try { if (me) localStorage.setItem(KEY, JSON.stringify(me)); else localStorage.removeItem(KEY); } catch (e) {}
    render();
    if (window.otPlayingRender) window.otPlayingRender();
    otTrack("me", { action: me ? "set" : "clear", via: via });
    otIdentify();
    // A pick made here is passed to the account (online.js) when signed in; the account's own changes aren't sent back.
    if (via !== "account" && window.otMeChanged) window.otMeChanged(me);
  }
  var pickItem = document.getElementById("menu-pick"), menuClear = document.getElementById("menu-clear"), menuStats = document.getElementById("menu-stats");
  if (menuClear) menuClear.addEventListener("click", function () { save(null, "menu"); });
  // online.js reads and sets the pick through this, for the account's claim of the player.
  // lock(true): the account's approved player can't be cleared here (no "Ich bin nicht …", no toggle off); it can still be replaced.
  window.otMe = { team: "${slug}", season: "${SEASON_KEY}", root: "${root}", get: function () { return me; }, set: function (next) { save(next, "account"); }, lock: function (on) { if (locked !== !!on) { locked = !!on; render(); } } };
  function render() {
    var id = me ? String(me.person) : "";
    if (id) document.body.dataset.me = id; else delete document.body.dataset.me;
    document.querySelectorAll(".is-me, .has-me").forEach(function (el) { el.classList.remove("is-me", "has-me"); });
    if (id) document.querySelectorAll('[data-person="' + id + '"]:not(button)').forEach(function (el) {
      el.classList.add("is-me");
      var c = el.parentElement && el.parentElement.closest(".card");
      if (c) c.classList.add("has-me");
    });
    if (list) {
      order.forEach(function (c) { list.appendChild(c); });
      var mine = id && list.querySelector('[data-person="' + id + '"]');
      if (mine) list.prepend(mine);
    }
    document.querySelectorAll(".me-toggle").forEach(function (b) {
      var on = b.dataset.person === id;
      b.setAttribute("aria-pressed", String(on));
      b.querySelector("span").textContent = on ? "Das bist Du" : "Das bin ich";
    });
    if (dlg) dlg.querySelectorAll(".me-option").forEach(function (o) {
      if (o.dataset.person === id) o.setAttribute("aria-current", "true"); else o.removeAttribute("aria-current");
    });
    // Changing the player means "Ich bin nicht …" first, then choosing again.
    if (pickItem) pickItem.hidden = !!me;
    // A pick made on a player page or stored earlier may lack the player page link; the list knows it.
    if (me && !me.href && dlg) {
      var known = dlg.querySelector('.me-option[data-person="' + id + '"]');
      if (known && known.dataset.href) {
        me.href = known.dataset.href;
        try { localStorage.setItem(KEY, JSON.stringify(me)); } catch (e) {}
      }
    }
    // The hint box is only for visitors without a chosen player; the rest is done from the menu.
    if (card) card.hidden = !!me;
    if (menuClear) {
      menuClear.hidden = !me || locked;
      if (me) menuClear.querySelector("span").textContent = "Ich bin nicht " + me.name.replace(/^([^,]+),\s*(.+)$/, "$2 $1");
    }
    if (menuStats) {
      menuStats.hidden = !(me && me.href);
      if (me && me.href) menuStats.href = new URL("${root}" + me.href, location.href).href;
    }
  }
  document.querySelectorAll(".me-toggle").forEach(function (b) {
    b.addEventListener("click", function () {
      if (locked && me && String(me.person) === b.dataset.person) return;
      save(me && String(me.person) === b.dataset.person ? null : { person: Number(b.dataset.person), name: b.dataset.name, href: b.dataset.href }, "page");
    });
  });
  if (card && dlg) {
    var hintBtn = card.querySelector(".hint-btn"), hint = card.querySelector(".me-hint");
    hintBtn.addEventListener("click", function () {
      hint.hidden = !hint.hidden;
      hintBtn.setAttribute("aria-expanded", String(!hint.hidden));
    });
    dlg.querySelector(".dialog-close").addEventListener("click", function () { dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll(".me-option").forEach(function (o) {
      o.addEventListener("click", function () { dlg.close(); save({ person: Number(o.dataset.person), name: o.dataset.name, href: o.dataset.href }, "list"); });
    });
    // The menu item and the overview's "Wer bist Du?" hint link here to open the list right away.
    if (location.hash === "#wer-bist-du") {
      dlg.showModal();
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
    if (pickItem) pickItem.addEventListener("click", function (e) { e.preventDefault(); dlg.showModal(); });
  }
  render();
})();`;

/** How many release notes the dialog shows per page when opened from the menu (all notes are embedded, filtered by role in the browser). */
const RELEASES_PAGE = 3;
const RELEASE_KEY = storageKey("releaseSeen");
/** Where the client saves the signed-in account (uid, roles); see SAVED_KEY in client/online.ts. */
const ACCOUNT_KEY = `${storageKey("auth")}-account`;

/**
 * Release notes dialog. The footer link opens it with all embedded notes. On team pages it opens
 * by itself with the notes newer than the last one seen; new users (no team chosen yet) skip
 * those and start from the newest. "Seen" is stored when the dialog is closed. If the new-results
 * pop-up is open, the notes wait until it is closed. Must run before REMEMBER sets the team key.
 */
const RELEASE_NOTES = (auto: boolean) => `(function () {
  var dlg = document.getElementById("release-dialog");
  if (!dlg) return;
  var all = Array.prototype.slice.call(dlg.querySelectorAll("[data-release]"));
  var arts = [], newest = null, seen = null, known = null;
  var link = document.getElementById("release-link");
  // Only the notes for the user's roles; everyone counts as a member, also when signed out.
  // Runs again when the account changes (sign-in, sign-out, roles loaded): online.js calls otReleaseRefilter.
  function refilter() {
    var mine = ["member"];
    try {
      var acc = JSON.parse(localStorage.getItem("${ACCOUNT_KEY}") || "null");
      if (acc && acc.uid && Array.isArray(acc.roles)) mine = acc.roles.concat("member");
    } catch (e) {}
    arts = all.filter(function (a) {
      var r = a.dataset.roles;
      return !r || r.split(" ").some(function (x) { return mine.indexOf(x) >= 0; });
    });
    all.forEach(function (a) { a.hidden = arts.indexOf(a) < 0; });
    newest = arts.length ? arts[0].dataset.release : null;
    if (link) link.style.display = arts.length ? "" : "none";
  }
  refilter();
  window.otReleaseRefilter = refilter;
  try { seen = localStorage.getItem("${RELEASE_KEY}"); known = localStorage.getItem("${TEAM_KEY}"); } catch (e) {}
  var nav = dlg.querySelector(".release-nav"), prev = nav.children[0], label = nav.children[1], next = nav.children[2];
  var list = [], from = 0;
  // Pages of ${RELEASES_PAGE}, newest first; the notes shown automatically (the new ones) come on one page.
  function page(paged) {
    var size = paged ? ${RELEASES_PAGE} : list.length;
    all.forEach(function (a) { var i = list.indexOf(a); a.hidden = i < from || i >= from + size; });
    nav.hidden = !paged || list.length <= size;
    prev.disabled = from <= 0;
    next.disabled = from + size >= list.length;
    label.textContent = (Math.floor(from / size) + 1) + " / " + Math.ceil(list.length / size);
    dlg.querySelector(".release-body").scrollTop = 0;
  }
  prev.addEventListener("click", function () { from = Math.max(0, from - ${RELEASES_PAGE}); page(true); });
  next.addEventListener("click", function () { from += ${RELEASES_PAGE}; page(true); });
  function show(shown, via) {
    list = shown; from = 0;
    page(via === "menu");
    dlg.showModal();
    // The OK button is focused, but the notes start at the top, newest first.
    dlg.querySelector(".release-body").scrollTop = 0;
    otTrack("release-notes", { id: newest, via: via });
  }
  // Saved right away on a click too: the close event fires a moment later, possibly after a reload.
  function done() { try { if (newest) localStorage.setItem("${RELEASE_KEY}", newest); } catch (e) {} dlg.close(); }
  dlg.querySelectorAll(".dialog-close, .btn-primary").forEach(function (b) { b.addEventListener("click", done); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) done(); });
  dlg.addEventListener("close", function () { try { if (newest) localStorage.setItem("${RELEASE_KEY}", newest); } catch (e) {} });
  document.getElementById("release-link").addEventListener("click", function (e) { e.preventDefault(); show(arts, "menu"); });
  if (!${auto} || !newest) return;
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
  const shown = releaseNotes();
  if (!shown.length) return "";
  return html`<dialog class="team-dialog release-dialog" id="release-dialog" aria-labelledby="release-dialog-h">
  <div class="dialog-head">
    <h2 id="release-dialog-h">Was ist neu?</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  <div class="release-body">
  ${shown.map(
    (r) => html`<article data-release="${esc(r.id)}"${r.roles.length ? ` data-roles="${esc(r.roles.join(" "))}"` : ""}>
      <h3>${esc(r.title)}</h3>
      <p class="small muted release-meta">${esc(formatDate(r.date))}${r.roles.map((x) => ` <span class="badge badge--outline">${esc(ROLE_LABELS[x] ?? x)}</span>`).join("")}</p>
      ${r.html}
    </article>`,
  )}
  </div>
  <div class="release-nav" hidden>
    <button type="button" class="btn">‹ Neuere</button><span class="small muted"></span><button type="button" class="btn">Ältere ›</button>
  </div>
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

/**
 * The header menu: a dialog at the top right. Items marked data-menu-close close it first (capture
 * phase, so before their own handlers run), so help dialogs, release notes and prompts never open
 * on top of it. The theme and share items stay open: their change is visible in the menu itself.
 */
const MENU = `(function () {
  var btn = document.getElementById("menu-btn"), dlg = document.getElementById("menu-dialog");
  btn.addEventListener("click", function () { dlg.showModal(); otTrack("menu"); });
  dlg.querySelector(".dialog-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) dlg.close();
    else if (e.target.closest("[data-menu-close]")) dlg.close();
    var t = e.target.closest("[data-track]");
    if (t) otTrack(t.getAttribute("data-track"));
  }, true);
})();`;

const MENU_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>`;

/** The menu: account (filled by online.js), app actions, notes and privacy. Item ids are used by the page scripts. */
function menuDialog(assets: string, root: string | null): string {
  return html`<dialog class="team-dialog menu-dialog" id="menu-dialog" aria-labelledby="menu-h">
  <div class="dialog-head">
    <h2 id="menu-h">Menü</h2>
    <button type="button" class="dialog-close" aria-label="Schließen">×</button>
  </div>
  ${ONLINE || root != null
    ? html`<div class="menu-section" id="menu-user">
    ${ONLINE ? `<div id="account-who"></div>` : ""}
    ${root != null ? `<a class="menu-item" id="menu-pick" href="${root}spieler.html#wer-bist-du" data-menu-close>${PERSON_ICON}<span>Name wählen</span></a>
    <a class="menu-item" id="menu-stats" href="#" data-menu-close hidden>${STATS_ICON}<span>Meine Statistik</span></a>
    <button type="button" class="menu-item" id="menu-clear" data-menu-close hidden>${CLEAR_ICON}<span></span></button>` : ""}
    ${ONLINE ? `<div id="account-actions"></div>` : ""}
  </div>`
    : ""}
  <div class="menu-section">
    <button type="button" class="menu-item" id="install-btn" data-menu-close hidden>${INSTALL_ICON}<span>App installieren</span></button>
    <button type="button" class="menu-item" id="share-btn" hidden>${SHARE_BTN_ICON}<span>App teilen</span></button>
    <button type="button" class="menu-item theme-toggle" id="theme-toggle">${MOON}${SUN}<span>Dunkles Design</span></button>
    ${releaseNotes().length ? `<a class="menu-item" href="#" id="release-link" data-menu-close>${RELEASE_ICON}<span>Was ist neu?</span></a>` : ""}
    <a class="menu-item" href="${assets}datenschutz.html">${LOCK_ICON}<span>Datenschutz</span></a>
  </div>
  <div class="menu-section" id="menu-feedback">
    <p class="menu-who">Feedback / Ideen</p>
    <a class="menu-item" href="${esc(SIGNAL_URL)}" target="_blank" rel="noopener" data-menu-close data-track="feedback-signal">${SIGNAL_ICON}<span>Per Signal schreiben</span></a>
    <a class="menu-item" href="mailto:${esc(PRIVACY_CONTACT)}?subject=${encodeURIComponent("Feedback OT Badminton")}" data-menu-close data-track="feedback-mail">${MAIL_ICON}<span>Per E-Mail schreiben</span></a>
  </div>
</dialog>`;
}

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
// Session properties: what kind of user this is. One line per attribute in PROPS; otIdentify() sends
// them all (again) whenever something changed. extra overrides probes, e.g. online.js sets storage.
var otExtra = {};
var otProps = {
  app: function () { return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true ? "app" : "browser"; },
  team: function () { return localStorage.getItem("${TEAM_KEY}") ? "yes" : "no"; },
  player: function () {
    for (var i = 0; i < localStorage.length; i++) if (localStorage.key(i).indexOf("${storageKey("me-")}") === 0) return "yes";
    return "no";
  },
  storage: function () { return "local"; }
};
function otIdentify(extra) {
  if (extra) for (var k in extra) otExtra[k] = extra[k];
  if (!window.umami || !umami.identify) return;
  var data = {};
  for (var key in otProps) { try { data[key] = otExtra[key] || otProps[key](); } catch (e) {} }
  umami.identify(data);
}
(function () {
  var s = document.createElement("script");
  var app = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  s.defer = true;
  s.src = "${UMAMI_SCRIPT}";
  s.dataset.websiteId = "${UMAMI_WEBSITE_ID}";
  s.dataset.domains = "${UMAMI_DOMAIN}";
  s.dataset.tag = app ? "app" : "browser";
  s.onload = function () { otIdentify(); };
  document.head.appendChild(s);
})();`;
/**
 * Content Security Policy as a meta tag (GitHub Pages can't send headers, so frame-ancestors and
 * reporting are not possible). It limits where scripts load from and where the page may send data:
 * only this site, Umami and Supabase. The pages use inline scripts and styles, hence 'unsafe-inline'.
 * Images may come from any https host (the Google profile picture). Add a new external host here.
 */
export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${new URL(UMAMI_SCRIPT).origin}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  `connect-src 'self' ${ONLINE ? `${new URL(SUPABASE_URL).origin} ` : ""}${new URL(UMAMI_SCRIPT).origin} https://api-gateway.umami.dev`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Stages share the live hostname, so Umami's domain filter wouldn't keep them out: no tracking there. */
const TRACKING = UMAMI_WEBSITE_ID !== "" && !STAGE;
/** Stub when tracking is off, so the other scripts can call otTrack() unconditionally. */
const NO_ANALYTICS = `function otTrack() {}\nfunction otIdentify() {}`;

const THEME_TOGGLE = `(function () {
  var root = document.documentElement, btn = document.getElementById("theme-toggle");
  function label() {
    var dark = root.dataset.theme === "dark";
    btn.querySelector("span").textContent = dark ? "Helles Design" : "Dunkles Design";
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
      timer = setTimeout(function () { label.textContent = "App teilen"; }, 2000);
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
export const SHARE_BTN_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;

const MOON = `<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
const SUN = `<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const CHEVRON = `<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

const RELEASE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5 5.6.8-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>`;
const PERSON_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
const STATS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>`;
const CLEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="4"/><path d="M2 21a8 8 0 0 1 12.5-6.6M17 14l5 5M22 14l-5 5"/></svg>`;
const SIGNAL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/></svg>`;
const MAIL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`;
const LOCK_ICON =`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`;

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
  return parts.length ? `<p>${parts.join(" · ")}</p>` : "";
}

/** The back link goes through history when the visitor came from that very page, so its scroll position is kept. */
const BACK_LINK = `(function () {
  var a = document.querySelector(".back a");
  if (!a || !document.referrer || history.length < 2) return;
  try {
    var ref = new URL(document.referrer);
    if (ref.origin === location.origin && ref.pathname === a.pathname) {
      a.addEventListener("click", function (e) { e.preventDefault(); history.back(); });
    }
  } catch (e) {}
})();`;

/** From a stage's root (stage/<name>/) back to the live site's root. */
const STAGE_TO_LIVE = "../../index.html";

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
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a409f">
${o.noindex || STAGE ? `<meta name="robots" content="noindex">\n` : ""}<title>${esc(o.title)} · ${esc(team ? `${CLUB_NAME} ${team.label}` : `${CLUB_NAME} Badminton`)}</title>
<script>${THEME_INIT}</script>
<script>${TRACKING ? ANALYTICS : NO_ANALYTICS}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${assets}${stylesHref()}">
<link rel="icon" href="${assets}favicon.svg" type="image/svg+xml">
<link rel="manifest" href="${assets}manifest.webmanifest">
<link rel="apple-touch-icon" href="${assets}icons/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${esc(APP_SHORT_NAME)}">
</head>
<body${o.meeting ? ` data-meeting="${o.meeting}"` : ""}>
${STAGE ? html`<div class="stage-banner" role="note">Testversion: <b>${esc(STAGE)}</b> · <a href="${assets}${STAGE_TO_LIVE}">Zur Live-Version</a></div>` : ""}
<header class="site-header">
  <div class="container header-inner">
    <img class="club-logo" src="${assets}club-logo.png" alt="TSV Osterholz-Tenever" width="40" height="40">
    ${brand}
    <div class="header-actions">
      <button type="button" class="header-btn menu-btn" id="menu-btn" aria-haspopup="dialog" aria-label="Menü" title="Menü">${MENU_ICON}</button>
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
${o.back ? `<p class="back"><a href="${esc(o.back.href)}">← ${esc(o.back.label)}</a></p>` : ""}
${o.body}
</main>
<footer class="site-footer">
  <div class="container">
    <p>Inoffizielle Ansicht. Daten: <a href="${esc(o.sourceUrl ?? (team ? urls.groupPage(team) : urls.clubTeams()))}">nuLiga</a> / Bremer Badminton-Verband.</p>
    ${TRACKING ? `<p>Anonyme Nutzungsstatistik mit Umami, ohne Cookies und ohne persönliche Daten. Erfasst wird auch, ob die App installiert ist, ob ein Team und ein Spieler gewählt sind und ob Angaben lokal oder im Konto liegen (nur Ja/Nein, keine Namen).</p>` : ""}
    ${footerStatus(o.checkedAt)}
    <p><a href="${assets}datenschutz.html">Datenschutz</a></p>
  </div>
</footer>
${team ? teamDialog(team, assets) : ""}
${team ? NEW_DIALOG : ""}
${menuDialog(assets, team ? o.root : null)}
${ONLINE && team ? `<script type="application/json" id="me-roster">${JSON.stringify(rosterEntries()).replace(/</g, "\\u003c")}</script>` : ""}
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
${o.back ? `<script>${BACK_LINK}</script>` : ""}
<script>${MENU}</script>
<script>${THEME_TOGGLE}</script>
${ONLINE ? `<script src="${assets}${onlineHref()}" data-callback="${assets}auth-callback.html" defer></script>` : ""}
<script>${INSTALL(assets)}</script>
${releaseNotes().length ? `<script>${RELEASE_NOTES(team != null)}</script>` : ""}
${team ? `<script>${REMEMBER(team.slug)}${TEAM_SWITCH}${NEW_RESULTS(team.slug)}${PLAYING(team.slug)}${ME(team.slug, o.root)}</script>` : ""}
${o.script ? `<script>${o.script}</script>` : ""}
</body>
</html>
`;
}
