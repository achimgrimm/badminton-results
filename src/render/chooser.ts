import { CLUB_NAME, SEASON_LABEL } from "../config.ts";
import type { ClubTeam, Meeting, Standing } from "../types.ts";
import { layout, TEAM_KEY, teamGroups } from "./layout.ts";
import { esc, formatDate, html } from "./util.ts";

/** "Sa, 14.11. · auswärts bei TuS Komet Arsten" for the team's next match. */
function nextLine(t: ClubTeam, m: Meeting): string {
  const day = formatDate(m.date).replace(/\.\d{4}$/, ".");
  const where = m.home === t.name ? `Heim gegen ${m.guest}` : `Auswärts bei ${m.home}`;
  return `${day}${m.time ? `, ${m.time} Uhr` : ""} · ${where}`;
}

/** Forwards to the last selected team unless the chooser was asked for explicitly (#auswahl). */
const FORWARD = `(function () {
  if (location.hash === "#auswahl") return;
  var slug = null;
  try { slug = localStorage.getItem("${TEAM_KEY}"); } catch (e) {}
  var known = Array.prototype.some.call(document.querySelectorAll("[data-team]"), function (a) { return a.dataset.team === slug; });
  if (slug && known) location.replace(slug + "/");
})();`;

export function renderChooser(teams: ClubTeam[], standings: Map<string, Standing | undefined>, nextMatches: Map<string, Meeting | undefined>, checkedAt: string | null): string {
  const body = html`
    <h1>Mannschaft wählen</h1>
    <p class="small muted">Tabellen, Spielpläne, Spielberichte und Spielerstatistiken aller ${esc(CLUB_NAME)}-Mannschaften in der Saison ${esc(SEASON_LABEL)}. Deine Auswahl wird gemerkt.</p>
    ${teamGroups(teams).map(
      ([heading, list]) => html`<h2>${heading}</h2>
        ${list.map((t) => {
          const s = standings.get(t.slug);
          const next = nextMatches.get(t.slug);
          return html`<a class="card team-card" href="${t.slug}/" data-team="${esc(t.slug)}">
            <div class="player-head">
              <span class="player-name">${esc(t.label)}</span>
              ${s ? `<span class="player-rec num">${s.rank}.</span>` : ""}
            </div>
            <div class="card-meta">
              <span>${esc(t.league)}${t.name !== CLUB_NAME ? ` · als ${esc(t.name)}` : ""}</span>
              ${s ? `<span class="badges"><span class="small">${s.points[0]}:${s.points[1]} Punkte</span></span>` : ""}
            </div>
            ${next ? `<div class="small next-line">Nächstes Spiel: ${esc(nextLine(t, next))}</div>` : ""}
          </a>`;
        })}`,
    )}
  `;
  return layout({ title: "Mannschaften", root: "", assets: "", nav: null, checkedAt, body, script: FORWARD });
}
