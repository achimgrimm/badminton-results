import type { Standing } from "../types.ts";
import { clean, load, pair, param, resultTable } from "./util.ts";

export function parseTable(html: string): Standing[] {
  const $ = load(html);
  const rows = resultTable($).find("tr").filter((_, tr) => $(tr).find("td").length >= 10);
  return rows.toArray().map((tr) => {
    const td = $(tr).find("td");
    const text = (i: number) => clean(td.eq(i).text());
    const icon = td.eq(0).find("img").attr("title") ?? "";
    const link = td.eq(2).find("a");
    return {
      rank: Number(text(1)),
      team: clean(link.text() || td.eq(2).text()),
      teamtable: param(link.attr("href"), "teamtable"),
      zone: /Aufsteiger/i.test(icon) ? "up" : /Absteiger/i.test(icon) ? "down" : null,
      played: Number(text(3)),
      won: Number(text(4)),
      drawn: Number(text(5)),
      lost: Number(text(6)),
      points: pair(text(7)) ?? [0, 0],
      games: pair(text(8)) ?? [0, 0],
      sets: pair(text(9)) ?? [0, 0],
    };
  });
}
