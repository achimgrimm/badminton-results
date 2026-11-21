import { SEASON_KEY } from "./config.ts";
import type { ClubTeam, Meeting } from "./types.ts";
import { slug } from "./render/util.ts";

/** An own match in the next days, stored for the reminder push (#21, #62). */
export interface Upcoming { team: string; season: string; game: string; home: string; guest: string; start: string }

/** The instant of a Europe/Berlin wall-clock date ("2026-11-15") and time ("15:00"). */
export function berlinInstant(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" }).formatToParts(guess);
  const m = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offset = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  return new Date(guess.getTime() - offset * 60_000);
}

/** How far ahead matches are synced; the 24 h reminder window is applied by notify-reminders. */
export const SYNC_WINDOW_DAYS = 7;

/** Matches of the team without a result that start within the next days. */
export function upcomingMatches(team: ClubTeam, schedule: Meeting[], now = new Date()): Upcoming[] {
  return schedule.flatMap((m) => {
    if ((m.home !== team.name && m.guest !== team.name) || m.result || !m.time || !/^\d{1,2}:\d{2}$/.test(m.time)) return [];
    const start = berlinInstant(m.date, m.time.padStart(5, "0"));
    const ahead = start.getTime() - now.getTime();
    if (!(ahead > 0 && ahead <= SYNC_WINDOW_DAYS * 24 * 3600_000)) return [];
    const home = m.home === team.name;
    return [{ team: team.slug, season: SEASON_KEY, game: `${home ? "heim" : "auswaerts"}-${slug(home ? m.guest : m.home)}`, home: m.home, guest: m.guest, start: start.toISOString() }];
  });
}

/** An open meeting of a league in the next days, stored for the push to followers of its teams (#61). */
export interface UpcomingMeeting { group: number; meeting: number; home: string; guest: string; start: string }

/** All meetings of the league without a result that start within the next days (any teams, not only the club's). */
export function upcomingMeetings(group: number, schedule: Meeting[], now = new Date()): UpcomingMeeting[] {
  return schedule.flatMap((m) => {
    if (m.meeting == null || m.result || !m.time || !/^\d{1,2}:\d{2}$/.test(m.time)) return [];
    const start = berlinInstant(m.date, m.time.padStart(5, "0"));
    const ahead = start.getTime() - now.getTime();
    if (!(ahead > 0 && ahead <= SYNC_WINDOW_DAYS * 24 * 3600_000)) return [];
    return [{ group, meeting: m.meeting, home: m.home, guest: m.guest, start: start.toISOString() }];
  });
}
