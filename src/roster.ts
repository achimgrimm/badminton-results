import { POOLS, type PoolRound } from "./config.ts";
import { teamNumber } from "./parse/club.ts";
import type { PoolRow } from "./parse/pools.ts";
import type { RosterPlayer } from "./types.ts";

/** Parsed clubPools pages: contest type -> round -> rows. */
export type Pools = Record<string, Partial<Record<PoolRound, PoolRow[]>>>;

/** The roster age classes a team plays from, by the first word of its label; [] if unknown. */
export function poolTypes(label: string): string[] {
  return POOLS[label.split(" ")[0]] ?? [];
}

/**
 * Who can play for a team: its Stammspieler (Mannschaft = team number) and the club's reserve players
 * of its age classes. Each class uses the Rückrunde roster once nuLiga has one, else the Vorrunde.
 */
export function teamRoster(label: string, pools: Pools): RosterPlayer[] {
  const number = teamNumber(label);
  const byPerson = new Map<number, RosterPlayer>();
  for (const type of poolTypes(label)) {
    const rounds = pools[type] ?? {};
    const rows = rounds.rueckrunde?.length ? rounds.rueckrunde : (rounds.vorrunde ?? []);
    for (const r of rows) {
      const role = r.team === number ? "team" : r.team == null ? "reserve" : null;
      if (!role || byPerson.get(r.person)?.role === "team") continue;
      byPerson.set(r.person, { name: r.name, person: r.person, rank: r.rank, role });
    }
  }
  return [...byPerson.values()];
}
