export const BASE_URL = "https://brbv-badminton.liga.nu";
export const WA = `${BASE_URL}/cgi-bin/WebObjects/nuLigaBADDE.woa/wa`;

/** TSV Osterholz-Tenever on nuLiga; its teams are discovered from the club page. */
export const CLUB = 11473;
export const CLUB_NAME = "OT Bremen";
/** Team names in the leagues: "OT Bremen", "OT Bremen II", … */
export const CLUB_PREFIX = "OT Bremen";
export const SEASON_LABEL = "2026/27";

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
  court: (location: number) => `${WA}/courtInfo?federation=BrBV&location=${location}`,
};

/** Umami Cloud: cookieless page view counting. An empty ID disables tracking. */
export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";
export const UMAMI_WEBSITE_ID: string = "3063f1a3-eff3-4074-9e54-08f13cd3b50d";
/** Only the live site is counted, not local previews. */
export const UMAMI_DOMAIN = "achimgrimm.github.io";
