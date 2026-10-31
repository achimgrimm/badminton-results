import { OWN_TEAM } from "../config.ts";
import type { Meeting } from "../types.ts";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for HTML content and attribute values. */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Tagged template that joins arrays and skips null/false, without escaping. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, s, i) => {
    const v = i > 0 ? values[i - 1] : "";
    const text = Array.isArray(v) ? v.join("") : v == null || v === false ? "" : String(v);
    return out + text + s;
  });
}

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const WEEKDAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/** "2026-10-31" -> "Sa, 31.10.2026" (or "Samstag, 31.10.2026") */
export function formatDate(iso: string, long = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${(long ? WEEKDAYS_LONG : WEEKDAYS)[day]}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

/** Today's date in Bremen as ISO string. */
export function todayInBremen(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) + " Uhr";
}

/** "Böse, Frank" -> "Frank Böse" */
export function displayName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

export const isOwn = (team: string) => team === OWN_TEAM;
export const involvesOwn = (m: Meeting) => isOwn(m.home) || isOwn(m.guest);

export type Outcome = "win" | "draw" | "loss";

/** Result from the given team's point of view; null if it didn't play or no result yet. */
export function outcomeFor(team: string, m: Meeting): Outcome | null {
  if (!m.result || (m.home !== team && m.guest !== team)) return null;
  const [mine, other] = m.home === team ? m.result : [m.result[1], m.result[0]];
  return mine > other ? "win" : mine < other ? "loss" : "draw";
}

/** Result from OT's point of view; null if OT didn't play or no result yet. */
export function ownOutcome(m: Meeting): Outcome | null {
  return outcomeFor(OWN_TEAM, m);
}

/** "TV Eiche Horn V" -> "tv-eiche-horn-v" */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function opponentOf(m: Meeting): string {
  return isOwn(m.home) ? m.guest : m.home;
}

/** Stable per pairing: each opponent is met once at home and once away. */
export function previewName(m: Meeting): string {
  return `${isOwn(m.home) ? "heim" : "auswaerts"}-${slug(opponentOf(m))}`;
}

/** OT meetings without a result yet get a Vorschau page instead of a Spielbericht. */
export function hasPreview(m: Meeting): boolean {
  return involvesOwn(m) && !m.result;
}

export function previewHref(root: string, m: Meeting): string {
  return `${root}vorschau/${previewName(m)}.html`;
}

export const OUTCOME_LABEL: Record<Outcome, string> = { win: "Sieg", draw: "Unentschieden", loss: "Niederlage" };

export function outcomeBadge(outcome: Outcome | null): string {
  return outcome ? `<span class="badge badge--${outcome}">${OUTCOME_LABEL[outcome]}</span>` : "";
}
