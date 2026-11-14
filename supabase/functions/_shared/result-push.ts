/** Texts and input checks for the push about a new result of a followed team (#48). Pure, tested with the app's tests. */

export interface NewResult { group: number; meeting: number; home: string; guest: string; result: [number, number] }

/** The scraper's list of new results, or null when it is not well-formed. */
export function parseNewResults(input: unknown): NewResult[] | null {
  if (!Array.isArray(input) || input.length > 500) return null;
  const out: NewResult[] = [];
  for (const r of input as Record<string, unknown>[]) {
    const res = r?.result;
    if (!Number.isInteger(r?.group) || !Number.isInteger(r?.meeting)
      || typeof r.home !== "string" || typeof r.guest !== "string" || !r.home || !r.guest
      || !Array.isArray(res) || res.length !== 2 || !res.every((n) => Number.isInteger(n) && n >= 0)) return null;
    out.push({ group: r.group as number, meeting: r.meeting as number, home: r.home, guest: r.guest, result: [res[0], res[1]] });
  }
  return out;
}

/** The push for one subscribed team of the meeting: team, opponent and score (the team's score first). */
export function resultText(r: NewResult, team: string): { title: string; body: string } {
  const isHome = r.home === team;
  const [own, other] = isHome ? r.result : [r.result[1], r.result[0]];
  const opponent = isHome ? r.guest : r.home;
  const verdict = own > other ? "Sieg" : own < other ? "Niederlage" : "Unentschieden";
  return { title: `${team}: ${verdict}`, body: `${team} – ${opponent} ${own}:${other}` };
}
