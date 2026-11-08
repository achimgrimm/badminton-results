import type { Dataset } from "../data.ts";
import type { Meeting } from "../types.ts";
import { matchCard } from "./components.ts";
import { CLUB_NAME, storageKey } from "../config.ts";
import { layout, SHARE_BTN_ICON } from "./layout.ts";
import { esc, formatDate, html, involvesOwn, todayInBremen } from "./util.ts";

const SCRIPT = `
(function () {
  var header = document.querySelector(".site-header");
  if (header) document.documentElement.style.setProperty("--sticky-top", header.offsetHeight + "px");
  var KEY = "${storageKey("spielplan-filter")}";
  var buttons = document.querySelectorAll(".filter button");
  function apply(mode) {
    if (mode !== "own" && mode !== "mine" && mode !== "all") mode = "own";
    document.body.classList.toggle("only-own", mode === "own");
    document.body.classList.toggle("only-mine", mode === "mine");
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    try { localStorage.setItem(KEY, mode); } catch (e) {}
  }
  buttons.forEach(function (b) { b.addEventListener("click", function () { apply(b.dataset.mode); }); });
  var saved = "own";
  try { saved = localStorage.getItem(KEY) || "own"; } catch (e) {}
  apply(saved);
  shareButton();
  var today = document.querySelector(".day.upcoming" + (saved === "own" ? ".has-own" : saved === "mine" ? ".has-mine" : ""));
  if (today && location.hash === "") today.scrollIntoView();

  /** Shares the upcoming marked matches as plain text (all in "text": a separate url gets appended by WhatsApp). */
  function shareButton() {
    var btn = document.querySelector(".share-plan"), label = btn.querySelector("span"), timer = null;
    btn.addEventListener("click", function () {
      var cards = document.querySelectorAll(".day.upcoming .match-card[data-play-when].is-playing, .day.upcoming .match-card[data-play-when].is-maybe");
      // Always visible: with nothing to share it says what to do instead.
      if (!cards.length) { flash("Erst Spiele mit „Ich spiele“ oder „Vielleicht“ markieren"); return; }
      var lines = [btn.dataset.shareTitle];
      cards.forEach(function (c) {
        lines.push("", c.dataset.playWhen, c.dataset.playVs + (c.classList.contains("is-maybe") ? " (vielleicht)" : ""));
        if (c.getAttribute("href")) lines.push(new URL(c.getAttribute("href"), location.href).href);
      });
      var text = lines.join("\\n");
      var method = navigator.share ? "share" : navigator.clipboard ? "clipboard" : "prompt";
      otTrack("share-plan", { count: cards.length, method: method });
      if (navigator.share) {
        navigator.share({ title: btn.dataset.shareTitle, text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () { flash("Kopiert"); }, function () { prompt("Zum Kopieren:", text); });
      } else {
        prompt("Zum Kopieren:", text);
      }
    });
    function flash(text) {
      label.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(function () { label.textContent = "Meine Spiele teilen"; }, 2500);
    }
  }
})();`;

/**
 * Android has no handler for webcal: links, so a tap does nothing there (also in the installed app).
 * There the button subscribes through Google Calendar's "add by URL" link instead, which keeps the
 * feed updated and syncs to the calendar app on the phone.
 */
const CALENDAR = `(function () {
  var btn = document.getElementById("calendar-btn");
  if (!btn) return;
  var android = /Android/i.test(navigator.userAgent);
  if (android) {
    btn.href = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(btn.dataset.webcal);
    btn.target = "_blank";
    btn.rel = "noopener";
    document.getElementById("calendar-hint").hidden = false;
  }
  btn.addEventListener("click", function () { otTrack("calendar", { via: android ? "google" : "webcal" }); });
})();`;

function groupByDate(meetings: Meeting[]): [string, Meeting[]][] {
  const groups = new Map<string, Meeting[]>();
  for (const m of meetings) groups.set(m.date, [...(groups.get(m.date) ?? []), m]);
  return [...groups];
}

export function renderSpielplan(d: Dataset, now: Date): string {
  const today = todayInBremen(now);
  // nuLiga lists the Vorrunde first; the Rückrunde starts in the new calendar year.
  const sorted = [...d.schedule].sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  let firstUpcoming = true;

  const days = groupByDate(sorted).map(([date, meetings]) => {
    const upcoming = date >= today && firstUpcoming;
    if (upcoming) firstUpcoming = false;
    const cls = ["day", meetings.some(involvesOwn) && "has-own", date >= today && "upcoming"].filter(Boolean).join(" ");
    return html`<section class="${cls}">
        <h2${date === today ? ' class="is-today"' : ""}>${esc(formatDate(date, true))}${date === today ? " · Heute" : ""}</h2>
        ${meetings.map((m) => matchCard(m, "", { pending: !m.result && m.date < today, toggle: true }))}
      </section>`;
  });

  const calendar = d.team.webcalUrl
    ? html`<div class="btn-row">
        <a class="btn btn-primary" id="calendar-btn" href="${esc(d.team.webcalUrl)}" data-webcal="${esc(d.team.webcalUrl)}">📅 Spiele in Deinen Kalender</a>
        ${d.team.icalUrl ? `<a class="btn btn-secondary" href="${esc(d.team.icalUrl)}">.ics herunterladen</a>` : ""}
      </div>
      <p class="small muted" id="calendar-hint" hidden>Öffnet Google Kalender. Nach „Hinzufügen“ erscheinen die Spiele in Deiner Kalender-App und bleiben aktuell.</p>`
    : "";

  const body = html`
    <h1 class="visually-hidden">Spielplan</h1>
    <div class="filter-bar"><div class="filter" role="group" aria-label="Filter">
      <button type="button" data-mode="own" aria-pressed="false">Nur ${esc(d.own.label)}</button>
      <button type="button" data-mode="mine" aria-pressed="false">Meine Spiele</button>
      <button type="button" data-mode="all" aria-pressed="true">Alle</button>
    </div></div>
    <div><button type="button" class="btn btn-primary share-plan" data-share-title="${esc(`Meine Spiele · ${CLUB_NAME} ${d.own.label}`)}">${SHARE_BTN_ICON}<span>Meine Spiele teilen</span></button></div>
    ${calendar}
    <p class="mine-empty muted">Noch keine Spiele ausgewählt. Tippe bei einem Spiel auf „Ich spiele“ oder wähle unter <a href="spieler.html">Spieler</a> Deinen Namen.</p>
    ${days}
  `;

  return layout({ title: "Spielplan", root: "", nav: "spielplan", checkedAt: d.meta.checkedAt, body, script: SCRIPT + CALENDAR });
}
