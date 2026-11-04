export const BASE_URL = "https://brbv-badminton.liga.nu";
export const WA = `${BASE_URL}/cgi-bin/WebObjects/nuLigaBADDE.woa/wa`;

/** TSV Osterholz-Tenever on nuLiga; its teams are discovered from the club page. */
export const CLUB = 11473;
export const CLUB_NAME = "OT Bremen";
/** Team names in the leagues: "OT Bremen", "OT Bremen II", … */
export const CLUB_PREFIX = "OT Bremen";
export const SEASON_LABEL = "2026/27";
/** The footer links the build's commit here. */
export const REPO_URL = "https://github.com/achimgrimm/badminton-results";

export type PoolRound = "vorrunde" | "rueckrunde";

/**
 * nuLiga roster age classes ("contestType" on the clubPools page) per team label, matched on the
 * label's first word: "Aktive III" plays from O19 Herren and O19 Damen, Mannschaft 3.
 */
export const POOLS: Record<string, string[]> = {
  Aktive: ["O19 Herren", "O19 Damen"],
  Jugend: ["U19 Jugend (gemischt)"],
  "Schüler": ["U15 Schüler (gemischt)"],
};

/** A league on nuLiga. */
export interface Group {
  championship: string;
  group: number;
}

const groupQuery = (g: Group) =>
  new URLSearchParams({ championship: g.championship, group: String(g.group) }).toString();

export const urls = {
  clubTeams: () => `${WA}/clubTeams?club=${CLUB}`,
  table: (g: Group) => `${WA}/groupPage?displayTyp=gesamt&displayDetail=table&${groupQuery(g)}`,
  schedule: (g: Group) => `${WA}/groupPage?displayTyp=gesamt&displayDetail=meetings&${groupQuery(g)}`,
  groupPage: (g: Group) => `${WA}/groupPage?${groupQuery(g)}`,
  team: (g: Group, teamtable: number) => `${WA}/teamPortrait?teamtable=${teamtable}&pageState=gesamt&${groupQuery(g)}`,
  report: (g: Group, meeting: number) => `${WA}/groupMeetingReport?meeting=${meeting}&${groupQuery(g)}`,
  /** Club roster for an age class; round "vorrunde" or "rueckrunde". */
  pools: (contestType: string, round: PoolRound) =>
    `${WA}/clubPools?${new URLSearchParams({ displayTyp: round, club: String(CLUB), contestType, seasonName: SEASON_LABEL })}`,
  court: (location: number) => `${WA}/courtInfo?federation=BrBV&location=${location}`,
};

/** Umami Cloud: cookieless page view counting. An empty ID disables tracking. */
export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";
export const UMAMI_WEBSITE_ID: string = "3063f1a3-eff3-4074-9e54-08f13cd3b50d";
/** Only the live site is counted, not local previews. */
export const UMAMI_DOMAIN = "achimgrimm.github.io";

/** Branch name → stage folder name: lowercase, every run of other characters becomes "-". */
export function stageName(branch: string): string {
  return branch.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * The test stage this build is for, from the STAGE env var (a branch name); "" is the live site.
 * A stage is served from stage/<name>/ on the same origin as the live site.
 */
export const STAGE = stageName(process.env.STAGE ?? "");

/** localStorage key; stages get their own prefix, so testing never touches the live app's data. */
export function storageKey(name: string): string {
  return STAGE ? `stage-${STAGE}-${name}` : name;
}
