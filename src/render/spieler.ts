import type { Dataset } from "../data.ts";
import { isDoubles, playerStats, type PlayerGame, type PlayerStats, type Tally } from "../stats.ts";
import { playerGenders } from "../lineup.ts";
import type { Gender, Player, RosterPlayer } from "../types.ts";
import { CHECK, reportHref } from "./components.ts";
import { layout } from "./layout.ts";
import { displayName, esc, formatDate, html, outcomeBadge, slug } from "./util.ts";

export interface PlayerPage {
  stats: PlayerStats;
  /** File name without extension, e.g. "boese-frank" */
  slug: string;
}

const GENDER_LABEL: Record<Gender, string> = { m: "Herren", f: "Damen" };

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

/** Someone the user can pick as themselves, with a link to their stats page if they have one. */
export interface Pickable extends RosterPlayer {
  href: string | null;
}

/** Sorted as shown: "Böse, Frank" is listed as "Frank Böse", so it sorts under F. */
const byName = (a: { name: string }, b: { name: string }) => displayName(a.name).localeCompare(displayName(b.name), "de");

/**
 * Everyone who can pick themselves on this team: the nuLiga roster (Stammspieler and club reserves)
 * plus anyone else who already played for the team according to its Spielberichte.
 */
export function pickablePlayers(d: Dataset, pages: PlayerPage[]): Pickable[] {
  const hrefs = new Map(pages.map((p) => [p.stats.person, `spieler/${p.slug}.html`]));
  const all = new Map<number, Pickable>(d.roster.map((r) => [r.person, { ...r, href: hrefs.get(r.person) ?? null }]));
  for (const { stats } of pages) {
    if (stats.person == null || all.has(stats.person)) continue;
    all.set(stats.person, { name: stats.name, person: stats.person, rank: null, role: "report", href: hrefs.get(stats.person)! });
  }
  return [...all.values()].sort(byName);
}

/** "Wer bist Du?" card and the dialog with the names to pick from (see ME in layout.ts). */
function mePicker(players: Pickable[]): string {
  if (!players.length) return "";
  const option = (p: Pickable) =>
    html`<li><button type="button" class="me-option" data-person="${p.person}" data-name="${esc(p.name)}"${p.href ? ` data-href="${esc(p.href)}"` : ""}>
      <span class="team-label">${esc(displayName(p.name))}</span>
    </button></li>`;
  const groups: [string, Pickable[]][] = [
    ["Stammspieler", players.filter((p) => p.role === "team")],
    ["Ersatzspieler", players.filter((p) => p.role !== "team")],
  ];
  return html`<section class="card me-card" id="me-card">
      <div class="me-none">
        <p><b>Wer bist Du?</b> Wähle Deinen Namen, dann hebt die App Deine Spiele hervor.</p>
        <div class="btn-row"><button type="button" class="btn btn-primary me-pick">Namen wählen</button></div>
      </div>
      <div class="me-some" hidden>
        <p class="me-who"><span>Du bist <b class="me-name"></b>.</span> <button type="button" class="link-button me-clear">Ich bin nicht <span class="me-name"></span></button></p>
        <div class="btn-row">
          <a class="btn btn-primary me-link" href="#" hidden>Meine Statistik</a>
        </div>
      </div>
      <p class="small muted">Wird nur auf diesem Gerät gespeichert.</p>
    </section>
    <dialog class="team-dialog me-dialog" id="me-dialog" aria-labelledby="me-dialog-h">
      <div class="dialog-head">
        <h2 id="me-dialog-h">Wer bist Du?</h2>
        <button type="button" class="dialog-close" aria-label="Schließen">×</button>
      </div>
      ${groups.filter(([, list]) => list.length).map(
        ([heading, list]) => html`<h3>${heading}</h3><ul class="team-list">${list.map(option)}</ul>`,
      )}
    </dialog>`;
}

export const quota = (t: Tally) => (t.played ? `${Math.round((t.won / t.played) * 100)}\u00a0%` : "–");
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

/** One line of a player's match card: discipline, partner, outcome, opponents and sets. */
function gameLine(g: PlayerGame): string {
  const sets = g.sets
    .map(([mine, theirs]) => `<span class="${mine > theirs ? "set won" : "set"}">${mine}:${theirs}</span>`)
    .join(`<span class="muted"> · </span>`);
  return html`<div class="game-line">
      <div class="game-head">
        <span class="badge badge--primary">${esc(g.discipline)}</span>
        ${g.partner ? `<span class="small">mit ${esc(displayName(g.partner))}</span>` : ""}
        ${g.walkover ? `<span class="badge badge--warn">kampflos</span>` : outcomeBadge(g.outcome === "win" ? "win" : g.outcome === "loss" ? "loss" : null)}
      </div>
      ${g.opponents.length ? `<div class="small muted">gegen ${g.opponents.map((n) => esc(displayName(n))).join(" / ")}</div>` : ""}
      ${sets ? `<div class="sets">${sets}</div>` : ""}
    </div>`;
}

/** The player's games of one Begegnung (a player has one or two) as a single card linking to the Spielbericht. */
function meetingLog(games: PlayerGame[], root: string): string {
  const g = games[0];
  return html`<a class="card game-log" href="${reportHref(root, g.meeting)}">
      <div class="card-meta">
        <span>${esc(formatDate(g.date))} · ${g.home ? "Heim" : "Auswärts"} gegen ${esc(g.opponentTeam)}</span>
      </div>
      ${games.map(gameLine)}
    </a>`;
}

/** Player games grouped by Begegnung, in the order of the log. */
function groupByMeeting(log: PlayerGame[]): PlayerGame[][] {
  const groups = new Map<number, PlayerGame[]>();
  for (const g of log) groups.set(g.meeting, [...(groups.get(g.meeting) ?? []), g]);
  return [...groups.values()];
}

export function renderSpielerListe(d: Dataset, pages: PlayerPage[]): string {
  const genders = playerGenders(d);
  const body = html`
    <h1 class="visually-hidden">Spieler</h1>
    ${mePicker(pickablePlayers(d, pages))}
    <p class="small muted">Alle Einsätze für ${esc(d.own.name)} in dieser Saison, aus den Spielberichten.</p>
    ${pages.length
      ? `<div id="player-list">${[...pages].sort((a, b) => byName(a.stats, b.stats)).map(
          ({ stats: s, slug }) => html`<a class="card player-card" href="spieler/${slug}.html"${s.person != null ? ` data-person="${s.person}"` : ""}>
            <div class="player-head">
              <span class="player-name">${esc(displayName(s.name))}</span>
              <span class="player-rec num">${record(s)}</span>
            </div>
            <div class="card-meta">
              <span>${s.person != null && genders.has(s.person) ? `${GENDER_LABEL[genders.get(s.person)!]} · ` : ""}${s.played} Spiel${s.played === 1 ? "" : "e"} · ${quota(s)} gewonnen</span>
            </div>
            ${disciplinePills(s)}
          </a>`,
        ).join("")}</div>`
      : `<p class="muted">Noch keine Spielberichte.</p>`}
  `;
  return layout({ title: "Spieler", root: "", nav: "spieler", checkedAt: d.meta.checkedAt, noindex: true, body });
}

export function renderSpieler(d: Dataset, { stats: s }: PlayerPage): string {
  const root = "../";
  const singles = s.disciplines.filter((x) => !isDoubles(x.discipline));
  const doubles = s.disciplines.filter((x) => isDoubles(x.discipline));
  const gender = s.person != null ? playerGenders(d).get(s.person) : undefined;

  const body = html`
    <h1${s.person != null ? ` data-person="${s.person}"` : ""}>${esc(displayName(s.name))}</h1>
    ${gender ? `<p class="small muted">${GENDER_LABEL[gender]}</p>` : ""}
    ${s.person != null
      ? html`<div class="btn-row"><button type="button" class="btn btn-secondary me-toggle" data-person="${s.person}" data-name="${esc(s.name)}" aria-pressed="false">${CHECK}<span>Das bin ich</span></button></div>`
      : ""}
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
    ${groupByMeeting(s.log).map((games) => meetingLog(games, root))}
  `;

  return layout({ title: displayName(s.name), root, nav: "spieler", back: { href: `${root}spieler.html`, label: "Spieler" }, checkedAt: d.meta.checkedAt, noindex: true, body });
}
