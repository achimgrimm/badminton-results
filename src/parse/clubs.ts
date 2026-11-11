import { BASE_URL } from "../config.ts";
import { absolute, clean, load, param } from "./util.ts";

/** A club as listed on nuLiga's clubSearch page. */
export interface ClubRow {
  id: number;
  name: string;
}

export function parseClubSearch(html: string): ClubRow[] {
  const $ = load(html);
  const clubs = new Map<number, ClubRow>();
  for (const a of $('a[href*="clubInfoDisplay"]').toArray()) {
    const id = param($(a).attr("href"), "club");
    const name = clean($(a).text());
    if (id && name && !clubs.has(id)) clubs.set(id, { id, name });
  }
  return [...clubs.values()];
}

/** URL of the club's logo on its clubInfoDisplay page; null when it has none. */
export function parseClubLogo(html: string): string | null {
  // The page's other images (federation logo, spacer) are plain files; an uploaded logo is a "wodata" resource.
  const url = absolute(load(html)('img[src*="wodata"]').first().attr("src"));
  // The scraper sends nuLiga's session cookie with this request: never to another host.
  return url && new URL(url).origin === new URL(BASE_URL).origin ? url : null;
}
