import type { Dataset } from "../data.ts";
import { hallAddress, matchCard } from "./components.ts";
import { layout } from "./layout.ts";
import { esc, formatDate, html, involvesOwn, isOwn, previewHref, todayInBremen } from "./util.ts";

export function renderIndex(d: Dataset, now: Date): string {
  const today = todayInBremen(now);
  const own = d.schedule.filter(involvesOwn);
  const upcoming = own.filter((m) => !m.result && m.date >= today);
  const pending = own.filter((m) => !m.result && m.date < today);
  const played = own.filter((m) => m.result).reverse();
  const next = upcoming[0];
  const standing = d.table.find((s) => isOwn(s.team));

  const nextBlock = next
    ? html`<section class="next" aria-labelledby="next-h">
        <h2 id="next-h">${next.date === today ? "Heute" : "Nächstes Spiel"}</h2>
        <div class="when">${esc(formatDate(next.date, true))}${next.time ? `, ${esc(next.time)} Uhr` : ""}</div>
        <div class="vs">${isOwn(next.home) ? `<b>Heim</b> gegen ${esc(next.guest)}` : `<b>Auswärts</b> bei ${esc(next.home)}`}</div>
        ${next.hall ? `<div>${esc(next.hall.name ?? next.hall.code)}</div>` : ""}
        ${next.hall?.location ? `<div class="small">${hallAddress(d.halls[next.hall.location])}</div>` : ""}
        ${next.postponed ? `<p class="small"><span class="badge">verlegt</span> ${esc(next.note)}</p>` : ""}
        <a class="btn btn-on-dark" href="${previewHref("", next)}">Zur Vorschau</a>
      </section>`
    : `<section class="next"><h2>Saison</h2><div class="when">Keine weiteren Spiele geplant</div></section>`;

  const stats = standing
    ? html`<div class="stats">
        <a class="stat" href="tabelle.html"><span class="stat-value">${standing.rank}.</span><span class="stat-label">Platz</span></a>
        <div class="stat"><span class="stat-value">${standing.points[0]}:${standing.points[1]}</span><span class="stat-label">Punkte</span></div>
        <div class="stat"><span class="stat-value">${standing.won}-${standing.drawn}-${standing.lost}</span><span class="stat-label">S-U-N</span></div>
      </div>`
    : "";

  const calendar = d.team.webcalUrl
    ? html`<div class="btn-row">
        <a class="btn btn-primary" href="${esc(d.team.webcalUrl)}">📅 Spiele in Deinen Kalender</a>
        ${d.team.icalUrl ? `<a class="btn btn-secondary" href="${esc(d.team.icalUrl)}">.ics herunterladen</a>` : ""}
      </div>`
    : "";

  const body = html`
    ${nextBlock}
    ${stats}
    ${calendar}
    ${pending.length ? `<h2>Ergebnis offen</h2>${pending.map((m) => matchCard(m, "", { showDate: true, pending: true })).join("")}` : ""}
    ${played.length ? `<h2>Letzte Ergebnisse</h2>${played.map((m) => matchCard(m, "", { showDate: true })).join("")}` : ""}
    ${upcoming.length > 1 ? `<h2>Weitere Spiele</h2>${upcoming.slice(1).map((m) => matchCard(m, "", { showDate: true })).join("")}` : ""}
  `;

  return layout({ title: "Übersicht", root: "", nav: "index", checkedAt: d.meta.checkedAt, body });
}
