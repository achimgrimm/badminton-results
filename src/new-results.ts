import type { Meeting } from "./types.ts";

export interface NewResult { group: number; meeting: number; home: string; guest: string; result: [number, number] }

/** Meetings of a league whose result is new or changed since the previous scrape (for the push, #48). */
export function newResults(group: number, before: Meeting[], after: Meeting[]): NewResult[] {
  const was = new Map(before.filter((m) => m.meeting != null).map((m) => [m.meeting, m.result?.join(":") ?? null]));
  return after.flatMap((m) =>
    m.meeting != null && m.result && was.get(m.meeting) !== m.result.join(":")
      ? [{ group, meeting: m.meeting, home: m.home, guest: m.guest, result: m.result }] : []);
}
