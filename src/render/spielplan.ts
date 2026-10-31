import type { Dataset } from "../data.ts";
import type { Meeting } from "../types.ts";
import { matchCard } from "./components.ts";
import { layout } from "./layout.ts";
import { esc, formatDate, html, involvesOwn, todayInBremen } from "./util.ts";

const SCRIPT = `
(function () {
  var KEY = "spielplan-filter";
  var buttons = document.querySelectorAll(".filter button");
  function apply(mode) {
    document.body.classList.toggle("only-own", mode === "own");
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === mode)); });
    try { localStorage.setItem(KEY, mode); } catch (e) {}
  }
  buttons.forEach(function (b) { b.addEventListener("click", function () { apply(b.dataset.mode); }); });
  var saved = "own";
  try { saved = localStorage.getItem(KEY) || "own"; } catch (e) {}
  apply(saved);
  var today = document.querySelector(".day.upcoming" + (saved === "own" ? ".has-own" : ""));
  if (today && location.hash === "") today.scrollIntoView();
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
        ${meetings.map((m) => matchCard(m, "", { pending: !m.result && m.date < today }))}
      </section>`;
  });

  const body = html`
    <h1>Spielplan</h1>
    <div class="filter" role="group" aria-label="Filter">
      <button type="button" data-mode="own" aria-pressed="false">Nur OT III</button>
      <button type="button" data-mode="all" aria-pressed="true">Alle Spiele</button>
    </div>
    ${days}
  `;

  return layout({ title: "Spielplan", root: "", nav: "spielplan", checkedAt: d.meta.checkedAt, body, script: SCRIPT });
}
