import { urls } from "../config.ts";
import type { Dataset } from "../data.ts";
import type { Game, MatchReport, Meeting, Player } from "../types.ts";
import { hallAddress } from "./components.ts";
import { layout } from "./layout.ts";
import { displayName, esc, formatDate, html, isOwn, outcomeBadge, ownOutcome } from "./util.ts";

const DISCIPLINES: Record<string, string> = {
  HE: "Herreneinzel",
  DE: "Dameneinzel",
  HD: "Herrendoppel",
  DD: "Damendoppel",
  GD: "Gemischtes Doppel",
  D: "Doppel",
  E: "Einzel",
};

export type PlayerLink = (p: Player) => string | null;

function players(list: Player[], link?: PlayerLink): string {
  return list
    .map((p) => {
      const href = link?.(p);
      const name = esc(displayName(p.name));
      return href ? `<a href="${href}">${name}</a>` : `<span>${name}</span>`;
    })
    .join("");
}

function gameCard(g: Game, r: MatchReport, link?: PlayerLink): string {
  const [hw, gw] = g.result ?? [0, 0];
  const ownSide = isOwn(r.home) ? 0 : isOwn(r.guest) ? 1 : null;
  const ownWon = ownSide == null || !g.result ? null : (ownSide === 0 ? hw > gw : gw > hw);
  const kind = g.discipline.replace(/^\d\.|\d$/g, "");
  const cols = Math.max(g.sets.length, 2);
  const cell = (side: 0 | 1, s: [number, number]) =>
    `<span class="pt${s[side] > s[1 - side] ? " won" : ""}">${s[side]}</span>`;
  const pad = (n: number) => `<span class="pt"></span>`.repeat(n);

  return html`<article class="card">
      <div class="game-head">
        <span class="badge badge--primary" title="${esc(DISCIPLINES[kind] ?? kind)}">${esc(g.discipline)}</span>
        <span class="small muted">${esc(DISCIPLINES[kind] ?? "")}</span>
        ${ownWon == null ? "" : outcomeBadge(ownWon ? "win" : "loss")}
      </div>
      <div class="game" style="--sets:${cols}">
        <div class="side${hw > gw ? " won" : ""}">${players(g.home, isOwn(r.home) ? link : undefined)}</div>
        ${g.sets.map((s) => cell(0, s))}${pad(cols - g.sets.length)}
        <div class="divider"></div>
        <div class="side${gw > hw ? " won" : ""}">${players(g.guest, isOwn(r.guest) ? link : undefined)}</div>
        ${g.sets.map((s) => cell(1, s))}${pad(cols - g.sets.length)}
      </div>
    </article>`;
}

export function renderBericht(d: Dataset, r: MatchReport, meeting: Meeting | undefined, link?: PlayerLink): string {
  const [h, g] = r.totals.games ?? meeting?.result ?? [0, 0];
  const outcome = meeting ? ownOutcome(meeting) : null;
  const date = r.date ?? meeting?.date;
  const t = r.totals;
  const hall = meeting?.hall?.location ? d.halls[meeting.hall.location] : undefined;

  const body = html`
    <section class="card report-head">
      <div class="card-meta" style="justify-content:center">${date ? esc(formatDate(date, true)) : ""}${r.time ? `, ${esc(r.time)} Uhr` : ""}</div>
      <div class="teams">
        <div class="team${isOwn(r.home) ? " is-own" : ""}">${esc(r.home)}</div>
        <div class="big">${h}:${g}</div>
        <div class="team${isOwn(r.guest) ? " is-own" : ""}">${esc(r.guest)}</div>
      </div>
      <div class="totals num">
        ${t.sets ? `<span>Sätze ${t.sets[0]}:${t.sets[1]}</span>` : ""}
        ${t.points ? `<span>Punkte ${t.points[0]}:${t.points[1]}</span>` : ""}
      </div>
      ${outcome ? `<p>${outcomeBadge(outcome)}</p>` : ""}
    </section>

    ${r.games.length
      ? r.games.map((game) => gameCard(game, r, link))
      : `<p class="muted">Für diese Begegnung sind bei nuLiga keine Einzelergebnisse eingetragen.</p>`}

    <h2>Infos</h2>
    <div class="card">
      <dl class="facts">
        ${meeting?.hall ? `<dt>Halle</dt><dd>${esc(meeting.hall.name ?? meeting.hall.code)}${hall ? `<br><span class="small">${hallAddress(hall)}</span>` : ""}</dd>` : ""}
        ${r.start ? `<dt>Spielzeit</dt><dd>${esc(r.start)}–${esc(r.end ?? "")} Uhr</dd>` : ""}
        ${r.referees.length ? `<dt>Schiedsrichter</dt><dd>${r.referees.map((n) => esc(displayName(n))).join(", ")}</dd>` : ""}
        <dt>Status</dt><dd>${r.approved ? "genehmigt" : `<span class="badge badge--warn">noch nicht genehmigt</span>`}</dd>
        ${meeting?.postponed ? `<dt>Hinweis</dt><dd>${esc(meeting.note)}</dd>` : ""}
      </dl>
    </div>
    <div class="btn-row">
      <a class="btn btn-secondary" href="${esc(urls.report(d.own, r.meeting))}">Original bei nuLiga</a>
      ${r.pdfUrl ? `<a class="btn btn-secondary" href="${esc(r.pdfUrl)}">PDF</a>` : ""}
    </div>
  `;

  return layout({
    title: `${r.home} – ${r.guest}`,
    root: "../",
    nav: null,
    checkedAt: d.meta.checkedAt,
    sourceUrl: urls.report(d.own, r.meeting),
    meeting: r.meeting,
    body,
  });
}
