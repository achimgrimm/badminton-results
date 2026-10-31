import type { Game, MatchReport, Player } from "../types.ts";
import { absolute, clean, isoDate, load, pair, param, resultTable, type Cheerio } from "./util.ts";

function players(cell: Cheerio): Player[] {
  const links = cell.find("a").toArray();
  if (links.length) {
    return links.map((a) => ({
      name: clean(cell.find(a).text()),
      person: param(cell.find(a).attr("href"), "person"),
    }));
  }
  // Unlinked names (e.g. "nicht angetreten") are separated by <br>.
  return (cell.html() ?? "")
    .split(/<br\s*\/?>/i)
    .map((s) => clean(s.replace(/<[^>]+>/g, "")))
    .filter(Boolean)
    .map((name) => ({ name, person: null }));
}

/** False when nuLiga serves the page without its result table (report being edited). */
export function reportAvailable(html: string): boolean {
  return load(html)("#content table.result-set").length > 0;
}

const DISCIPLINE = /^((\d\.)?(HE|DE|HD|DD|GD|ME|JE|JD|MD)|[DE]\d)$/;

/** Youth leagues number the games by pairing: "D1-D1" -> "D1" (Doppel), "2-2" -> "E2" (Einzel). */
export function normalizeDiscipline(label: string): string {
  const m = label.match(/^(D?)(\d)-\1\2$/);
  return m ? `${m[1] || "E"}${m[2]}` : label;
}

export function parseReport(html: string, meeting: number): MatchReport {
  const $ = load(html);
  const table = resultTable($);

  const header = table.find("tr").first().find("th");
  // Reports without individual games only have totals: a "Heimmannschaft / Gastmannschaft"
  // header with the team names in the row below.
  const summaryOnly = /Heimmannschaft/.test(header.text());
  const names = summaryOnly ? table.find("tr").eq(1).find("td") : header;
  const home = clean(names.eq(summaryOnly ? 0 : 1).text());
  const guest = clean(names.eq(summaryOnly ? 1 : 2).text());
  const setColumns = header.filter((_, th) => /Satz/.test($(th).text())).length;

  const games: Game[] = [];
  let totals: MatchReport["totals"] = { points: null, sets: null, games: null };

  for (const tr of table.find("tr").toArray().slice(1)) {
    const td = $(tr).find("td");
    const discipline = normalizeDiscipline(clean(td.eq(0).text()));
    if (td.length >= 6 + setColumns && DISCIPLINE.test(discipline)) {
      const rest = td.toArray().slice(3).map((c) => clean($(c).text()));
      const sets = rest.slice(0, setColumns).map(pair).filter((s): s is [number, number] => s !== null);
      const [points, setsWon, result] = rest.slice(setColumns).map(pair);
      games.push({
        discipline,
        home: players(td.eq(1)),
        guest: players(td.eq(2)),
        sets,
        points: points ?? null,
        setsWon: setsWon ?? null,
        result: result ?? null,
      });
    } else if ($(tr).find("b").length >= 3) {
      const [points, sets, gamesTotal] = $(tr).find("b").toArray().map((b) => pair($(b).text()));
      totals = { points, sets, games: gamesTotal };
    }
  }

  const h1 = clean($("#content h1").first().text());
  const paragraphs = $("#content p").toArray().map((p) => clean($(p).text()));
  const timing = paragraphs.find((p) => p.startsWith("Spielbeginn")) ?? "";
  const refs = $("#content p")
    .toArray()
    .find((p) => /Schiedsrichter/.test($(p).text()));

  return {
    meeting,
    home,
    guest,
    date: isoDate(h1),
    time: h1.match(/(\d{1,2}:\d{2})\s*Uhr/)?.[1] ?? null,
    games,
    totals,
    start: timing.match(/Spielbeginn:\s*(\d{1,2}:\d{2})/)?.[1] ?? null,
    end: timing.match(/Spielende:\s*(\d{1,2}:\d{2})/)?.[1] ?? null,
    referees: refs
      ? (($(refs).html() ?? "")
          .split(/<br\s*\/?>/i)
          .map((s) => clean(s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")).replace(/^Schiedsrichter.*?:\s*/, ""))
          .filter(Boolean))
      : [],
    approved: !paragraphs.some((p) => /noch nicht genehmigt/i.test(p)),
    pdfUrl: absolute($('#content a[href*="MeetingReport"]').attr("href")),
  };
}
