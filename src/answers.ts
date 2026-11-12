/** A player's answer to "Ich spiele" for one game, as team leads see it in the lineup planning. */
export type Status = "yes" | "maybe" | "no";

export const STATUS_LABEL: Record<Status, string> = { yes: "Dabei", maybe: "Vielleicht", no: "Kann nicht" };

/** Badge colour class per status (text always says it too). */
export const STATUS_BADGE: Record<Status, string> = { yes: "badge--playing", maybe: "badge--maybe", no: "badge--loss" };

const isStatus = (v: unknown): v is Status => v === "yes" || v === "maybe" || v === "no";

/**
 * The rows of the server function team_answers as { person: status }. Persons are strings, like the values of the
 * lineup selects. Rows that are malformed or have no answer are skipped; a player nobody answered for has no entry.
 */
export function statusMap(rows: unknown): Record<string, Status> {
  const out: Record<string, Status> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const row = r as { person?: unknown; state?: unknown } | null;
    if (row && typeof row.person === "number" && isStatus(row.state)) out[String(row.person)] = row.state;
  }
  return out;
}
