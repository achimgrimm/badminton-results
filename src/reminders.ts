import { SEASON_KEY } from "./config.ts";
import type { ClubTeam, Meeting } from "./types.ts";
import { slug } from "./render/util.ts";

/** An own match starting within the next 24 hours, for the reminder push (#21). */
export interface Upcoming { team: string; season: string; game: string; home: string; guest: string; start: string }

/** The instant of a Europe/Berlin wall-clock date ("2026-11-15") and time ("15:00"). */
export function berlinInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" }).formatToParts(guess);
  const m = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - offset * 60_000);
}

/** Matches of the team without a result that start within the next 24 hours (a match marked later still gets one reminder). */
export function upcomingMatches(team: ClubTeam, schedule: Meeting[], now = new Date()): Upcoming[] {
  return schedule.flatMap((m) => {
    if ((m.home !== team.name && m.guest !== team.name) || m.result || !m.time || !/^\d{1,2}:\d{2}$/.test(m.time)) return [];
    const start = berlinInstant(m.date, m.time.padStart(5, "0"));
    const ahead = start.getTime() - now.getTime();
    if (!(ahead > 0 && ahead <= 24 * 3600_000)) return [];
    const home = m.home === team.name;
    return [{ team: team.slug, season: SEASON_KEY, game: `${home ? "heim" : "auswaerts"}-${slug(home ? m.guest : m.home)}`, home: m.home, guest: m.guest, start: start.toISOString() }];
  });
}
