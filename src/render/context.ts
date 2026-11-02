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
