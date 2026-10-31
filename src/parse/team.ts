import type { Hall, TeamInfo } from "../types.ts";
import { absolute, clean, load, param } from "./util.ts";

export function parseTeam(html: string): TeamInfo {
  const $ = load(html);
  const content = $("#content");
  const ical = content.find('a[href*="getTeamMeetingsWebcal"]').toArray().map((a) => $(a).attr("href")!);
  return {
    title: clean(content.find("h1").first().text()),
    icalUrl: ical.find((h) => h.startsWith("http")) ?? null,
    webcalUrl: ical.find((h) => h.startsWith("webcal:")) ?? null,
    pdfUrl: absolute(content.find('a[href*="ScheduleReportFOP"]').attr("href")),
    halls: content
      .find('a[href*="courtInfo"]')
      .toArray()
      .filter((a) => !/roundTyp/.test($(a).attr("href") ?? ""))
      .map((a) => ({ name: clean($(a).text()), location: param($(a).attr("href"), "location") })),
  };
}

export function parseCourt(html: string, location: number): Hall {
  const $ = load(html);
  const content = $("#content");
  const name = clean(content.find("h1").first().contents().first().text());
  const p = content.find("h2:contains('Hallenadresse')").next("p");
  const address = (p.html() ?? "")
    .split(/<br\s*\/?>/i)
    .map((s) => clean(s.replace(/<[^>]+>/g, "")))
    .filter((s) => s && !s.startsWith("["));
  return {
    location,
    name,
    address,
    mapsUrl: p.find('a[href*="google.com/maps"]').attr("href") ?? null,
  };
}
