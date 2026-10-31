import type { Dataset } from "../data.ts";
import { isDoubles, playerStats, type PlayerGame, type PlayerStats, type Tally } from "../stats.ts";
import type { Player } from "../types.ts";
import { reportHref } from "./components.ts";
import { layout } from "./layout.ts";
import { displayName, esc, formatDate, html, outcomeBadge, slug } from "./util.ts";

export interface PlayerPage {
  stats: PlayerStats;
  /** File name without extension, e.g. "boese-frank" */
  slug: string;
}

/** Every OT player who appears in a Spielbericht, with a unique page name each. */
export function ownPlayers(d: Dataset): PlayerPage[] {
  const all = playerStats(Object.values(d.reports), d.own.name);
  const taken = new Set<string>();
  return all.map((stats) => {
    let name = slug(stats.name);
    if (taken.has(name)) name += `-${stats.person}`;
    taken.add(name);
    return { stats, slug: name };
  });
}

/** Link target for an OT player on a report page, or null if there is no page. */
export function playerLinker(pages: PlayerPage[], root: string): (p: Player) => string | null {
  const byPerson = new Map(pages.map((p) => [p.stats.person, p.slug]));
  return (p) => {
    const name = p.person != null ? byPerson.get(p.person) : undefined;
    return name ? `${root}spieler/${name}.html` : null;
  };
}

export const quota = (t: Tally) => (t.played ? `${Math.round((t.won / t.played) * 100)} %` : "–");
export const record = (t: Tally) => `${t.won}–${t.lost}`;
const pair = ([a, b]: [number, number]) => `${a}:${b}`;

/** Disciplines as outline pills: "1.HE ×2". */
export function disciplinePills(s: PlayerStats): string {
  return html`<span class="pill-row">${s.disciplines.map(
    (d) => `<span class="badge badge--outline">${esc(d.discipline)}${d.played > 1 ? ` ×${d.played}` : ""}</span>`,
  )}</span>`;
}

function tallyRow(label: string, t: Tally, strong = false): string {
  if (!t.played) return "";
  const cell = (v: string) => `<td class="num">${strong ? `<b>${v}</b>` : v}</td>`;
  return `<tr><th scope="row">${strong ? `<b>${label}</b>` : label}</th>${cell(String(t.played))}${cell(record(t))}${cell(quota(t))}</tr>`;
}

function gameLog(g: PlayerGame, root: string): string {
  const sets = g.sets
    .map(([mine, theirs]) => `<span class="${mine > theirs ? "set won" : "set"}">${mine}:${theirs}</span>`)
    .join(`<span class="muted"> · </span>`);
  return html`<a class="card game-log" href="${reportHref(root, g.meeting)}">
      <div class="card-meta">
        <span>${esc(formatDate(g.date))} · ${g.home ? "Heim" : "Auswärts"} gegen ${esc(g.opponentTeam)}</span>
      </div>
      <div class="game-head">
        <span class="badge badge--primary">${esc(g.discipline)}</span>
        ${g.partner ? `<span class="small">mit ${esc(displayName(g.partner))}</span>` : ""}
        ${g.walkover ? `<span class="badge badge--warn">kampflos</span>` : outcomeBadge(g.outcome === "win" ? "win" : g.outcome === "loss" ? "loss" : null)}
      </div>
      ${g.opponents.length ? `<div class="small muted">gegen ${g.opponents.map((n) => esc(displayName(n))).join(" / ")}</div>` : ""}
      ${sets ? `<div class="sets">${sets}</div>` : ""}
    </a>`;
}

export function renderSpielerListe(d: Dataset, pages: PlayerPage[]): string {
  const body = html`
    <h1>Spieler</h1>
    <p class="small muted">Alle Einsätze für ${esc(d.own.name)} in dieser Saison, aus den Spielberichten.</p>
    ${pages.length
      ? pages.map(
          ({ stats: s, slug }) => html`<a class="card player-card" href="spieler/${slug}.html">
            <div class="player-head">
              <span class="player-name">${esc(displayName(s.name))}</span>
              <span class="player-rec num">${record(s)}</span>
            </div>
            <div class="card-meta">
              <span>${s.played} Spiel${s.played === 1 ? "" : "e"} · ${quota(s)} gewonnen</span>
            </div>
            ${disciplinePills(s)}
          </a>`,
        )
      : `<p class="muted">Noch keine Spielberichte.</p>`}
  `;
  return layout({ title: "Spieler", root: "", nav: "spieler", checkedAt: d.meta.checkedAt, noindex: true, body });
}

export function renderSpieler(d: Dataset, { stats: s }: PlayerPage): string {
  const root = "../";
  const singles = s.disciplines.filter((x) => !isDoubles(x.discipline));
  const doubles = s.disciplines.filter((x) => isDoubles(x.discipline));

  const body = html`
    <h1>${esc(displayName(s.name))}</h1>
    <div class="stats">
      <div class="stat"><span class="stat-value">${s.played}</span><span class="stat-label">Spiele</span></div>
      <div class="stat"><span class="stat-value">${record(s)}</span><span class="stat-label">Siege–Niederl.</span></div>
      <div class="stat"><span class="stat-value">${quota(s)}</span><span class="stat-label">Quote</span></div>
    </div>
    <div class="card">
      <dl class="facts num">
        <dt>Sätze</dt><dd>${pair(s.sets)}</dd>
        <dt>Punkte</dt><dd>${pair(s.points)}</dd>
      </dl>
    </div>

    <h2>Nach Disziplin</h2>
    <div class="results-wrap">
      <table class="results results--plain">
        <thead><tr>
          <th scope="col">Disziplin</th>
          <th class="num" scope="col">Spiele</th>
          <th class="num" scope="col">S–N</th>
          <th class="num" scope="col">Quote</th>
        </tr></thead>
        <tbody>
          ${singles.map((x) => tallyRow(esc(x.discipline), x))}
          ${singles.length && doubles.length ? tallyRow("Einzel", s.singles, true) : ""}
          ${doubles.map((x) => tallyRow(esc(x.discipline), x))}
          ${singles.length && doubles.length ? tallyRow("Doppel", s.doubles, true) : ""}
        </tbody>
      </table>
    </div>

    ${s.partners.length
      ? html`<h2>Doppelpartner</h2>
        <div class="results-wrap">
          <table class="results results--plain">
            <thead><tr>
              <th scope="col">Partner</th>
              <th class="num" scope="col">Spiele</th>
              <th class="num" scope="col">S–N</th>
              <th class="num" scope="col">Quote</th>
            </tr></thead>
            <tbody>${s.partners.map((p) => tallyRow(esc(displayName(p.name)), p))}</tbody>
          </table>
        </div>`
      : ""}

    <h2>Alle Spiele</h2>
    ${s.log.map((g) => gameLog(g, root))}
  `;

  return layout({ title: displayName(s.name), root, nav: null, checkedAt: d.meta.checkedAt, noindex: true, body });
}
