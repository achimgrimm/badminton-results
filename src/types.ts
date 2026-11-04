export interface Standing {
  rank: number;
  team: string;
  teamtable: number | null;
  /** "up" = Aufsteiger, "down" = Absteiger */
  zone: "up" | "down" | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: [number, number];
  games: [number, number];
  sets: [number, number];
}

export interface Meeting {
  /** ISO date, e.g. 2026-09-26 */
  date: string;
  time: string | null;
  /** e.g. "verlegt, ursprünglicher Termin: Sa. 31.10.2026 15:00" */
  note: string | null;
  postponed: boolean;
  hall: { code: string; name: string | null; location: number | null } | null;
  home: string;
  guest: string;
  result: [number, number] | null;
  meeting: number | null;
  approved: boolean;
}

export interface Player {
  name: string;
  person: number | null;
}

export interface Game {
  /** e.g. "1.HD", "DE", "GD" */
  discipline: string;
  home: Player[];
  guest: Player[];
  sets: [number, number][];
  points: [number, number] | null;
  setsWon: [number, number] | null;
  result: [number, number] | null;
}

export interface MatchReport {
  meeting: number;
  home: string;
  guest: string;
  date: string | null;
  time: string | null;
  games: Game[];
  totals: { points: [number, number] | null; sets: [number, number] | null; games: [number, number] | null };
  start: string | null;
  end: string | null;
  referees: string[];
  approved: boolean;
  pdfUrl: string | null;
}

export interface TeamInfo {
  title: string;
  icalUrl: string | null;
  webcalUrl: string | null;
  pdfUrl: string | null;
  halls: { name: string; location: number | null }[];
}

export interface Hall {
  location: number;
  name: string;
  address: string[];
  mapsUrl: string | null;
}

/** One OT team with everything needed to scrape and render it. */
export interface ClubTeam {
  /** URL folder, e.g. "aktive-3" */
  slug: string;
  /** Club label, e.g. "Aktive III" */
  label: string;
  /** Name in the league, e.g. "OT Bremen III" */
  name: string;
  league: string;
  championship: string;
  group: number;
  teamtable: number;
}

/** A player the team can field: from nuLiga's club roster, or a substitute seen in its reports. */
export interface RosterPlayer {
  name: string;
  person: number;
  /** Position in the club roster; null when only seen in a Spielbericht */
  rank: number | null;
  /** "team" = Stammspieler of this team, "reserve" = club reserve, "report" = played for it, listed elsewhere */
  role: "team" | "reserve" | "report";
}
