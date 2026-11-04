import { clean, load, param } from "./util.ts";

/** One row of nuLiga's club roster (Vereinsrangliste) for an age class and round. */
export interface PoolRow {
  rank: number;
  /** Team number (1 = first team); null for reserve players ("Reservespieler") */
  team: number | null;
  name: string;
  person: number;
}

/** Parses a clubPools page. A round without a roster yet has a table without rows. */
export function parsePools(html: string): PoolRow[] {
  const $ = load(html);
  return $("#content table.result-set tr")
    .toArray()
    .map((tr) => {
      const cells = $(tr).children("td");
      const link = $(tr).find('a[href*="playerPortrait"]').first();
      const person = param(link.attr("href"), "person");
      const rank = Number(clean(cells.eq(0).text()));
      if (person == null || !Number.isInteger(rank) || rank < 1) return null;
      const team = clean(cells.eq(1).text());
      return { rank, team: /^\d+$/.test(team) ? Number(team) : null, name: clean(link.text()), person };
    })
    .filter((row): row is PoolRow => row !== null);
}
