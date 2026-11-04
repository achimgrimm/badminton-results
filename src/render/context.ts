import type { Release } from "../releases.ts";
import type { ClubTeam } from "../types.ts";

let current: ClubTeam | null = null;
let all: ClubTeam[] = [];

/**
 * The build renders one team at a time; helpers like isOwn() read the team from here.
 * null while rendering the team chooser.
 */
export function setTeam(team: ClubTeam | null, teams: ClubTeam[] = all): void {
  current = team;
  all = teams;
}

export function ownTeam(): ClubTeam {
  if (!current) throw new Error("setTeam() must be called before rendering a team page");
  return current;
}

export const currentTeam = (): ClubTeam | null => current;
export const clubTeams = (): ClubTeam[] => all;

/** Per played meeting of the current team: the nuLiga person ids of the OT players in its Spielbericht. */
let lineups = new Map<number, number[]>();
export function setLineups(l: Map<number, number[]>): void {
  lineups = l;
}
export const lineupOf = (meeting: number | null): number[] => (meeting != null ? (lineups.get(meeting) ?? []) : []);

/** The git commit the site is built from; null when git isn't available. */
export interface BuildVersion {
  sha: string;
  /** ISO commit date */
  date: string;
}

let version: BuildVersion | null = null;
export function setVersion(v: BuildVersion | null): void {
  version = v;
}
export const buildVersion = (): BuildVersion | null => version;

/**
 * Stylesheet URL with a hash of its content. The service worker serves assets from its cache first,
 * so a new page would otherwise get the old stylesheet once; a changed hash makes it fetch the new one.
 */
let styles = "styles.css";
export function setStylesHref(href: string): void {
  styles = href;
}
export const stylesHref = (): string => styles;

/** Release notes from release-notes/, newest first. */
let releases: Release[] = [];
export function setReleases(r: Release[]): void {
  releases = r;
}
export const releaseNotes = (): Release[] => releases;
