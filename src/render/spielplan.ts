import type { Dataset } from "../data.ts";
import type { Meeting } from "../types.ts";
import { matchCard } from "./components.ts";
import { CLUB_NAME } from "../config.ts";
import { layout, SHARE_BTN_ICON } from "./layout.ts";
import { esc, formatDate, html, involvesOwn, todayInBremen } from "./util.ts";

const SCRIPT = `
(function () {
  var KEY = "spielplan-filter";
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
      var cards = document.querySelectorAll(".day.upcoming .match-card.is-playing[data-play-when]");
      var lines = [btn.dataset.shareTitle];
      cards.forEach(function (c) {
        lines.push("", c.dataset.playWhen, c.dataset.playVs);
        if (c.getAttribute("href")) lines.push(new URL(c.getAttribute("href"), location.href).href);
      });
      var text = lines.join("\\n");
      var method = navigator.share ? "share" : navigator.clipboard ? "clipboard" : "prompt";
      otTrack("share-plan", { count: cards.length, method: method });
      if (navigator.share) {
        navigator.share({ title: btn.dataset.shareTitle, text: text }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          label.textContent = "Kopiert";
          clearTimeout(timer);
          timer = setTimeout(function () { label.textContent = "Meine Spiele teilen"; }, 2000);
        }, function () { prompt("Zum Kopieren:", text); });
      } else {
        prompt("Zum Kopieren:", text);
      }
    });
  }
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

  const body = html`
    <h1>Spielplan</h1>
    <div class="filter" role="group" aria-label="Filter">
      <button type="button" data-mode="own" aria-pressed="false">Nur ${esc(d.own.label)}</button>
      <button type="button" data-mode="mine" aria-pressed="false">Meine Spiele</button>
      <button type="button" data-mode="all" aria-pressed="true">Alle</button>
    </div>
    <div><button type="button" class="btn btn-primary share-plan" data-share-title="${esc(`Meine Spiele · ${CLUB_NAME} ${d.own.label}`)}">${SHARE_BTN_ICON}<span>Meine Spiele teilen</span></button></div>
    <p class="mine-empty muted">Noch keine Spiele ausgewählt. Tippe bei einem Spiel auf „Ich spiele“.</p>
    ${days}
  `;

  return layout({ title: "Spielplan", root: "", nav: "spielplan", checkedAt: d.meta.checkedAt, body, script: SCRIPT });
}
