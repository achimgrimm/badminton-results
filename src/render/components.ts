import type { Hall, Meeting } from "../types.ts";
import { OWN_TEAM } from "../config.ts";
import { esc, formatDate, hasPreview, html, involvesOwn, isOwn, opponentOf, outcomeBadge, outcomeFor, previewHref } from "./util.ts";

export function reportHref(root: string, meeting: number): string {
  return `${root}bericht/${meeting}.html`;
}

export function hallLabel(m: Meeting): string {
  return m.hall ? esc(m.hall.name ?? m.hall.code) : "";
}

export interface MatchCardOptions {
  showDate?: boolean;
  pending?: boolean;
  /** Team whose point of view the Sieg/Niederlage badge takes; defaults to OT. */
  perspective?: string;
}

/** A meeting as a card: teams stacked, score or time on the right. */
export function matchCard(m: Meeting, root: string, opts: MatchCardOptions = {}): string {
  const own = involvesOwn(m);
  const played = m.result != null;
  const [h, g] = m.result ?? [0, 0];
  const meta = [
    opts.showDate ? esc(formatDate(m.date)) : "",
    played && !opts.showDate ? "" : m.time ? `${esc(m.time)} Uhr` : "",
    hallLabel(m),
  ].filter(Boolean);

  const badges = [
    m.postponed ? `<span class="badge badge--warn" title="${esc(m.note)}">verlegt</span>` : "",
    played ? outcomeBadge(outcomeFor(opts.perspective ?? OWN_TEAM, m)) : opts.pending ? `<span class="badge badge--warn">Ergebnis offen</span>` : "",
  ].join("");

  const team = (name: string) => `<span class="team${isOwn(name) ? " is-own" : ""}">${esc(name)}</span>`;
  const body = played
    ? html`<div class="match">
        ${team(m.home)}<span class="score${h < g ? " lost" : ""}">${h}</span>
        ${team(m.guest)}<span class="score${g < h ? " lost" : ""}">${g}</span>
      </div>`
    : html`<div class="match match--upcoming">${team(m.home)}${team(m.guest)}</div>`;

  const inner = html`<div class="card-meta"><span>${meta.join(" · ")}</span>${badges ? `<span class="badges">${badges}</span>` : ""}</div>${body}`;
  const cls = `card match-card${own ? " is-own" : ""}`;
  if (m.meeting && played) {
    return `<a class="${cls}" href="${reportHref(root, m.meeting)}" aria-label="Spielbericht ${esc(m.home)} gegen ${esc(m.guest)}">${inner}</a>`;
  }
  if (hasPreview(m)) {
    return `<a class="${cls}" href="${previewHref(root, m)}" aria-label="Vorschau auf das Spiel gegen ${esc(opponentOf(m))}">${inner}</a>`;
  }
  return `<div class="${cls}">${inner}</div>`;
}

export function hallAddress(hall: Hall | undefined): string {
  if (!hall) return "";
  const text = esc(hall.address.join(", "));
  return hall.mapsUrl ? `<a href="${esc(hall.mapsUrl)}" target="_blank" rel="noopener">${text}</a>` : text;
}
