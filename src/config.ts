export const BASE_URL = "https://brbv-badminton.liga.nu";
export const WA = `${BASE_URL}/cgi-bin/WebObjects/nuLigaBADDE.woa/wa`;

export const CHAMPIONSHIP = "KV Bremen 26/27";
export const GROUP = 41836;
export const LEAGUE_NAME = "Kreisliga Bremen";
export const SEASON_LABEL = "2026/27";

export const OWN_TEAM = "OT Bremen III";
export const OWN_TEAMTABLE = 242926;

const groupQuery = () =>
  new URLSearchParams({ championship: CHAMPIONSHIP, group: String(GROUP) }).toString();

export const urls = {
  table: () => `${WA}/groupPage?displayTyp=gesamt&displayDetail=table&${groupQuery()}`,
  schedule: () => `${WA}/groupPage?displayTyp=gesamt&displayDetail=meetings&${groupQuery()}`,
  groupPage: () => `${WA}/groupPage?${groupQuery()}`,
  team: () => `${WA}/teamPortrait?teamtable=${OWN_TEAMTABLE}&pageState=gesamt&${groupQuery()}`,
  report: (meeting: number) => `${WA}/groupMeetingReport?meeting=${meeting}&${groupQuery()}`,
  court: (location: number) => `${WA}/courtInfo?federation=BrBV&location=${location}`,
};
