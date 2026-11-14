/** Input check and text for the reminder push before a marked match (#21). Pure, tested with the app's tests. */

export interface Upcoming { team: string; season: string; game: string; home: string; guest: string; start: string }

/** The scraper's list of matches in the next 24 hours, or null when it is not well-formed. */
export function parseUpcoming(input: unknown): Upcoming[] | null {
  if (!Array.isArray(input) || input.length > 200) return null;
  const out: Upcoming[] = [];
  for (const r of input as Record<string, unknown>[]) {
    for (const k of ["team", "season", "game", "home", "guest", "start"]) {
      if (typeof r?.[k] !== "string" || !r[k] || (r[k] as string).length > 200) return null;
    }
    if (Number.isNaN(Date.parse(r.start as string))) return null;
    out.push({ team: r.team as string, season: r.season as string, game: r.game as string, home: r.home as string, guest: r.guest as string, start: r.start as string });
  }
  return out;
}

/** "Heute"/"Morgen" is avoided: the push can arrive hours before; the time of day says enough. */
export function reminderText(u: Upcoming): { title: string; body: string } {
  const at = new Date(u.start).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return { title: "Erinnerung: Du spielst", body: `${u.home} – ${u.guest}, ${at} Uhr` };
}
