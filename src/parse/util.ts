import * as cheerio from "cheerio";
import { BASE_URL } from "../config.ts";

export type Cheerio = cheerio.Cheerio<any>;

export function load(html: string) {
  return cheerio.load(html);
}

/** Collapses whitespace (incl. &nbsp;) and trims. */
export function clean(text: string): string {
  return text.replace(/[\s ]+/g, " ").trim();
}

/** Parses "19:5" into [19, 5]; null when not a pair. */
export function pair(text: string): [number, number] | null {
  const m = clean(text).match(/^(\d+)\s*:\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Reads a numeric query parameter from a (relative) href. */
export function param(href: string | undefined, name: string): number | null {
  if (!href) return null;
  const v = new URL(href, BASE_URL).searchParams.get(name);
  return v && /^\d+$/.test(v) ? Number(v) : null;
}

export function absolute(href: string | undefined): string | null {
  return href ? new URL(href, BASE_URL).toString() : null;
}

/** "26.09.2026" -> "2026-09-26" */
export function isoDate(text: string): string | null {
  const m = clean(text).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** The first result table inside #content. */
export function resultTable($: cheerio.CheerioAPI): Cheerio {
  const table = $("#content table.result-set").first();
  if (!table.length) throw new Error("result-set table not found");
  return table;
}
