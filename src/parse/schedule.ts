import type { Meeting } from "../types.ts";
import { clean, isoDate, load, pair, param, resultTable } from "./util.ts";

/**
 * Parses a groupPage/teamPortrait meetings table. Rows on the same day as the
 * previous row leave the weekday/date cells empty, so the date carries forward.
 */
export function parseSchedule(html: string): Meeting[] {
  const $ = load(html);
  const meetings: Meeting[] = [];
  let date: string | null = null;

  for (const tr of resultTable($).find("tr").toArray()) {
    const td = $(tr).find("td");
    if (td.length < 7) continue;

    date = isoDate(td.eq(1).text()) ?? date;
    if (!date) continue;

    const timeCell = td.eq(2);
    const timeText = clean(timeCell.text());
    const note = timeCell.attr("title") ?? null;

    const hallLink = td.eq(3).find("a");
    const hallCode = clean(hallLink.text() || td.eq(3).text());

    const resultLink = td.eq(6).find("a");
    const result = pair(td.eq(6).text());

    meetings.push({
      date,
      time: timeText.match(/\d{1,2}:\d{2}/)?.[0] ?? null,
      note,
      postponed: /\bv$/.test(timeText) || /verlegt/i.test(note ?? ""),
      hall: hallCode
        ? {
            code: hallCode,
            name: td.eq(3).find("span").attr("title") ?? null,
            location: param(hallLink.attr("href"), "location"),
          }
        : null,
      home: clean(td.eq(4).text()),
      guest: clean(td.eq(5).text()),
      // nuLiga shows 0:0 for a report that was opened but not filled in yet.
      // A team match always has 8 games, so 0:0 is never a real result.
      result: result && result[0] + result[1] > 0 ? result : null,
      meeting: param(resultLink.attr("href"), "meeting"),
      approved: $(tr).find('img[title="Spielbericht genehmigt"]').length > 0,
    });
  }
  return meetings;
}
