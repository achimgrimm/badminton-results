import { CLUB_PREFIX } from "../config.ts";
import { clean, load, param } from "./util.ts";

/** A club team as listed on nuLiga's clubTeams page. */
export interface ClubTeamRow {
  /** e.g. "Aktive III", "Jugend II", "Schüler" */
  label: string;
  league: string;
  championship: string;
  group: number;
}

export function parseClubTeams(html: string): ClubTeamRow[] {
  const $ = load(html);
  return $("#content table.result-set tr")
    .toArray()
    .map((tr) => {
      const link = $(tr).find('a[href*="groupPage"]').first();
      const href = link.attr("href");
      const group = param(href, "group");
      const championship = href ? new URL(href, "https://x").searchParams.get("championship") : null;
      if (!group || !championship) return null;
      return { label: clean($(tr).find("td").first().text()), league: clean(link.text()), championship, group };
    })
    .filter((row): row is ClubTeamRow => row !== null);
}

/** The team's name inside its league: "Jugend II" -> "OT Bremen II". */
export function leagueName(label: string): string {
  const suffix = label.match(/\s([IVX]+)$/)?.[1];
  return suffix ? `${CLUB_PREFIX} ${suffix}` : CLUB_PREFIX;
}

const ROMAN: Record<string, number> = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

/** URL folder for a team: "Aktive III" -> "aktive-3", "Schüler" -> "schueler". */
export function teamSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\s([ivx]+)$/, (_, r: string) => ` ${ROMAN[r.toUpperCase()] ?? r}`)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
