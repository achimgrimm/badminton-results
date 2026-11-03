import type { Hall, Meeting } from "../types.ts";
import { ownTeam } from "./context.ts";
import { esc, formatDate, hasPreview, html, involvesOwn, isOwn, opponentOf, outcomeBadge, outcomeFor, previewHref, previewName } from "./util.ts";

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
  /** Own matches without a result get an "Ich spiele" toggle beside the card (see PLAYING in layout.ts). */
  toggle?: boolean;
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
    played ? outcomeBadge(outcomeFor(opts.perspective ?? ownTeam().name, m)) : opts.pending ? `<span class="badge badge--warn">Ergebnis offen</span>` : "",
  ].join("");

  const team = (name: string) => `<span class="team${isOwn(name) ? " is-own" : ""}">${esc(name)}</span>`;
  const body = played
    ? html`<div class="match">
        ${team(m.home)}<span class="score${h < g ? " lost" : ""}">${h}</span>
        ${team(m.guest)}<span class="score${g < h ? " lost" : ""}">${g}</span>
      </div>`
    : html`<div class="match match--upcoming">${team(m.home)}${team(m.guest)}</div>`;

  // The selected team's results can be flagged "Neu" on the device (see NEW_RESULTS in layout.ts).
  const markable = own && played;
  const inner = html`<div class="card-meta"><span>${meta.join(" · ")}</span>${badges || own ? `<span class="badges">${badges}</span>` : ""}</div>${body}`;
  const cls = `card match-card${own ? " is-own" : ""}`;
  const key = (markable
    ? ` data-result-key="${esc(resultKey(m))}" data-result-text="${esc(`${m.home} ${h}:${g} ${m.guest}`)}" data-result-date="${esc(formatDate(m.date))}"`
    : "") + (own ? ` data-play-key="${esc(previewName(m))}"` : "") + (own && !played ? shareData(m) : "");
  const card = cardElement(m, root, cls, key, inner);
  return opts.toggle && own && !played ? `<div class="play-wrap">${card}${playToggle(m)}</div>` : card;
}

function cardElement(m: Meeting, root: string, cls: string, key: string, inner: string): string {
  const played = m.result != null;
  if (m.meeting && played) {
    return `<a class="${cls}"${key} href="${reportHref(root, m.meeting)}" aria-label="Spielbericht ${esc(m.home)} gegen ${esc(m.guest)}">${inner}</a>`;
  }
  if (hasPreview(m)) {
    return `<a class="${cls}"${key} href="${previewHref(root, m)}" aria-label="Vorschau auf das Spiel gegen ${esc(opponentOf(m))}">${inner}</a>`;
  }
  return `<div class="${cls}"${key}>${inner}</div>`;
}

/** Text for sharing "Meine Spiele" (see the Spielplan script): when, and home or away against whom. */
function shareData(m: Meeting): string {
  const when = `${formatDate(m.date)}${m.time ? `, ${m.time} Uhr` : ""}`;
  const vs = isOwn(m.home) ? `Heim gegen ${m.guest}` : `Auswärts bei ${m.home}`;
  return ` data-play-when="${esc(when)}" data-play-vs="${esc(vs)}"`;
}

const CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/**
 * Button that marks an own match as one the user plays in. The client script PLAYING (layout.ts)
 * sets aria-pressed and the label; "card" sits beside a match card, "hero" in a dark box, "page" in plain content.
 */
export function playToggle(m: Meeting, variant: "card" | "hero" | "page" = "card"): string {
  const cls = variant === "card" ? "play-toggle" : `play-toggle btn ${variant === "hero" ? "btn-on-dark" : "btn-secondary"}`;
  return `<button type="button" class="${cls}" data-play-key="${esc(previewName(m))}" aria-pressed="false" aria-label="Ich spiele mit: ${esc(m.home)} gegen ${esc(m.guest)}">${CHECK}<span>Ich spiele</span></button>`;
}

/** Stable per-device id of a result: the nuLiga meeting number, else date and teams. */
export function resultKey(m: Meeting): string {
  return m.meeting ? String(m.meeting) : `${m.date}|${m.home}|${m.guest}`;
}

export function hallAddress(hall: Hall | undefined): string {
  if (!hall) return "";
  const text = esc(hall.address.join(", "));
  return hall.mapsUrl ? `<a href="${esc(hall.mapsUrl)}" target="_blank" rel="noopener">${text}</a>` : text;
}
