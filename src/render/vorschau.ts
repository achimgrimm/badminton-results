import type { Dataset } from "../data.ts";
import { headToHead, lineup, playerStats, teamForm, type PlayerStats, type Tally } from "../stats.ts";
import type { Meeting } from "../types.ts";
import { hallAddress, matchCard, playToggle } from "./components.ts";
import { layout } from "./layout.ts";
import { disciplinePills, quota, record } from "./spieler.ts";
import { displayName, esc, formatDate, html, isOwn, opponentOf, previewName } from "./util.ts";

const MATCH_HOURS = 3; // same duration as nuLiga's own calendar feed

/** Converts a Europe/Berlin wall-clock time to a UTC Date. */
function berlinToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const asBerlin = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Berlin" }) + " UTC").getTime();
  return new Date(guess - (asBerlin - guess));
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** A single-event calendar file for one meeting. */
export function renderIcs(d: Dataset, m: Meeting, now: Date): string {
  const hall = m.hall?.location ? d.halls[m.hall.location] : undefined;
  const where = [m.hall?.name ?? m.hall?.code, hall?.address.join(", ")].filter(Boolean).join(": ");
  const timing = m.time
    ? (() => {
        const start = berlinToUtc(m.date, m.time);
        const end = new Date(start.getTime() + MATCH_HOURS * 3600_000);
        return [`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`];
      })()
    : [`DTSTART;VALUE=DATE:${m.date.replace(/-/g, "")}`];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ot-bremen-results//DE",
    "BEGIN:VEVENT",
    `UID:${d.own.slug}-${previewName(m)}@ot-bremen-results`,
    `DTSTAMP:${icsStamp(now)}`,
    ...timing,
    `SUMMARY:${icsText(`${m.home} – ${m.guest}`)}`,
    `DESCRIPTION:${icsText(`${d.own.league}\nHeim: ${m.home}\nGast: ${m.guest}`)}`,
    where ? `LOCATION:${icsText(where)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .filter((line, i, all) => line || i === all.length - 1)
    .join("\r\n");
}

/** One row per opposing player: appearances, record, sets, disciplines, usual partner. */
function opponentRow(s: PlayerStats, own: string): string {
  const vsUs = s.log.filter((g) => g.opponentTeam === own);
  const usTally: Tally = {
    played: vsUs.length,
    won: vsUs.filter((g) => g.outcome === "win").length,
    lost: vsUs.filter((g) => g.outcome === "loss").length,
  };
  const partner = s.partners[0];
  return html`<tr>
      <td>
        <span class="player-name">${esc(displayName(s.name))}</span>
        ${disciplinePills(s)}
        ${partner ? `<span class="small muted">meist mit ${esc(displayName(partner.name))}</span>` : ""}
        ${vsUs.length ? `<span class="small vs-us">gegen uns: ${record(usTally)}</span>` : ""}
      </td>
      <td class="num">${s.played}</td>
      <td class="num"><b>${record(s)}</b><br><span class="small muted">${quota(s)}</span></td>
      <td class="num">${s.sets[0]}:${s.sets[1]}</td>
    </tr>`;
}

export function renderVorschau(d: Dataset, m: Meeting): string {
  const root = "../";
  const opponent = opponentOf(m);
  const home = isOwn(m.home);
  const hall = m.hall?.location ? d.halls[m.hall.location] : undefined;
  const standing = d.table.find((s) => s.team === opponent);
  const form = teamForm(d.schedule, opponent);
  const h2h = headToHead(d.schedule, d.own.name, opponent);
  const returnMatch = d.schedule.find(
    (x) => x !== m && !x.result && ((x.home === m.guest && x.guest === m.home)),
  );
  const opponentReports = Object.values(d.reports).filter((r) => r.home === opponent || r.guest === opponent);
  const lineups = lineup(opponentReports, opponent);
  const opponentPlayers = playerStats(opponentReports, opponent);

  const body = html`
    <section class="next">
      <h2>Vorschau · ${home ? "Heimspiel" : "Auswärtsspiel"}</h2>
      <div class="when">${esc(formatDate(m.date, true))}${m.time ? `, ${esc(m.time)} Uhr` : ""}</div>
      <div class="vs">${home ? `<b>Heim</b> gegen ${esc(opponent)}` : `<b>Auswärts</b> bei ${esc(opponent)}`}</div>
      ${m.postponed ? `<p class="small"><span class="badge">verlegt</span> ${esc(m.note)}</p>` : ""}
      <div class="btn-row">${playToggle(m, "hero")}</div>
    </section>

    <h2>Anfahrt</h2>
    <div class="card">
      <dl class="facts">
        <dt>Halle</dt><dd>${esc(m.hall?.name ?? m.hall?.code ?? "unbekannt")}</dd>
        ${hall ? `<dt>Adresse</dt><dd>${hallAddress(hall)}</dd>` : ""}
      </dl>
      <div class="btn-row">
        ${hall?.mapsUrl ? `<a class="btn btn-primary" href="${esc(hall.mapsUrl)}" target="_blank" rel="noopener">Route planen</a>` : ""}
        <a class="btn btn-secondary" href="${previewName(m)}.ics" download>Termin speichern</a>
      </div>
    </div>

    <h2>Gegner: ${esc(opponent)}</h2>
    ${standing
      ? html`<div class="stats">
          <div class="stat"><span class="stat-value">${standing.rank}.</span><span class="stat-label">Platz</span></div>
          <div class="stat"><span class="stat-value">${standing.points[0]}:${standing.points[1]}</span><span class="stat-label">Punkte</span></div>
          <div class="stat"><span class="stat-value">${standing.won}-${standing.drawn}-${standing.lost}</span><span class="stat-label">S-U-N</span></div>
        </div>`
      : ""}
    <h3>Letzte Ergebnisse</h3>
    ${form.length
      ? form.map((x) => matchCard(x, root, { showDate: true, perspective: opponent })).join("")
      : `<p class="muted">Noch keine Ergebnisse.</p>`}

    <h2>Direkter Vergleich</h2>
    ${h2h.length
      ? h2h.map((x) => matchCard(x, root, { showDate: true })).join("")
      : `<p class="muted">Noch kein Spiel in dieser Saison.${
          returnMatch ? ` Das Rückspiel ist am ${esc(formatDate(returnMatch.date))}.` : ""
        }</p>`}

    <h2>Spieler des Gegners</h2>
    ${opponentPlayers.length
      ? html`<p class="small muted">Alle ${opponentPlayers.length} Spieler, die ${esc(opponent)} bisher eingesetzt hat, nach Einsätzen.</p>
        <div class="results-wrap">
          <table class="results results--plain players-table">
            <thead><tr>
              <th scope="col">Spieler</th>
              <th class="num" scope="col" title="Spiele">Sp.</th>
              <th class="num" scope="col">S–N</th>
              <th class="num" scope="col">Sätze</th>
            </tr></thead>
            <tbody>${opponentPlayers.map((s) => opponentRow(s, d.own.name))}</tbody>
          </table>
        </div>`
      : `<p class="muted">Noch keine Spielberichte.</p>`}

    <h2>Aufstellung des Gegners</h2>
    ${lineups.length
      ? html`<p class="small muted">Aus ${opponentReports.length} Spielbericht${opponentReports.length === 1 ? "" : "en"}: wer in welcher Disziplin gespielt hat, mit Bilanz (S–N).</p>
        <div class="lineups">
          ${lineups.map(
            (l) => html`<article class="card lineup">
              <div class="game-head"><span class="badge badge--primary">${esc(l.discipline)}</span></div>
              <ul>
                ${l.entries.map(
                  (e) => html`<li>
                    <span class="who">${e.players.map((p) => `<span>${esc(displayName(p))}</span>`)}</span>
                    <span class="rec num">${e.played}× · ${e.won}–${e.lost}</span>
                  </li>`,
                )}
              </ul>
            </article>`,
          )}
        </div>`
      : `<p class="muted">Noch keine Spielberichte.</p>`}
  `;

  return layout({ title: `Vorschau ${m.home} – ${m.guest}`, root, nav: null, checkedAt: d.meta.checkedAt, body });
}
