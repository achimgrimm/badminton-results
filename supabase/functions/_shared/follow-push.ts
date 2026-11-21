/** Input check, matching and text for the push before a match of a followed team (#61). Pure, tested with the app's tests. */

export interface UpcomingMeeting { group: number; meeting: number; home: string; guest: string; start: string }

/** The scraper's list of open meetings, or null when it is not well-formed. */
export function parseMeetings(input: unknown): UpcomingMeeting[] | null {
  if (!Array.isArray(input) || input.length > 2000) return null;
  const out: UpcomingMeeting[] = [];
  for (const r of input as Record<string, unknown>[]) {
    if (!Number.isInteger(r?.group) || !Number.isInteger(r?.meeting)) return null;
    for (const k of ["home", "guest", "start"]) {
      if (typeof r[k] !== "string" || !r[k] || (r[k] as string).length > 200) return null;
    }
    if (Number.isNaN(Date.parse(r.start as string))) return null;
    out.push({ group: r.group as number, meeting: r.meeting as number, home: r.home as string, guest: r.guest as string, start: r.start as string });
  }
  return out;
}

/** The own match (as stored for the player reminder) that is this meeting: same teams and kick-off. */
export function ownMatchFor<T extends { home: string; guest: string; start: string }>(m: { home: string; guest: string; start: string }, own: T[]): T | undefined {
  const t = Date.parse(m.start);
  return own.find((o) => o.home === m.home && o.guest === m.guest && Date.parse(o.start) === t);
}

/** "Heute"/"Morgen" is avoided, like in reminderText: the time of day says enough. */
export function followStartText(m: UpcomingMeeting, team: string): { title: string; body: string } {
  const at = new Date(m.start).toLocaleString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return { title: `Spiel von ${team}`, body: `${m.home} – ${m.guest}, ${at} Uhr` };
}
