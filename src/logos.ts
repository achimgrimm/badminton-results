import { CLUB_PREFIX } from "./config.ts";
import type { Club } from "./types.ts";

/** File extension for the image types nuLiga serves logos as; null for anything else. No SVG: it would be served from our origin and can carry scripts. */
export function logoExtension(contentType: string): string | null {
  const type = contentType.split(";")[0].trim().toLowerCase();
  return { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[type] ?? null;
}

/**
 * The club a team belongs to: team names are the club name plus an optional numeral ("SV Weyhe IV").
 * Of several clubs matching, the longest name wins; null for the own club and for unknown clubs.
 */
export function clubFor(team: string, clubs: Club[]): Club | null {
  let best: Club | null = null;
  for (const c of clubs) {
    if (!team.startsWith(c.name) || !/^(\s+[IVX]+)?$/.test(team.slice(c.name.length))) continue;
    if (!best || c.name.length > best.name.length) best = c;
  }
  return best;
}

export function isOwnClub(team: string): boolean {
  return team === CLUB_PREFIX || team.startsWith(`${CLUB_PREFIX} `);
}

/** Path of a team's club logo relative to the site root, or null when there is none. */
export function logoPath(team: string, clubs: Club[]): string | null {
  if (isOwnClub(team)) return "club-logo.png";
  const logo = clubFor(team, clubs)?.logo;
  return logo ? `logos/${logo}` : null;
}
