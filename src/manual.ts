import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { ASSIGNABLE_ROLES } from "./roles.ts";

/** One feature of the manual, from manual/<nn>-<slug>.md */
export interface ManualSection {
  /** From the file name; the page handbuch/<slug>.html and the target of "manual:<slug>" links in release notes */
  slug: string;
  /** The weakest of MANUAL_ROLES the feature is for; stronger roles get it too */
  role: string;
  /** The first "# " line */
  title: string;
  /** The rest of the file as HTML */
  html: string;
  /** Permissions (as in the database) the feature describes; checked against the code by the tests */
  permissions: string[];
}

/**
 * The audiences of a feature, weakest first: signed out (member), signed in without a chosen player
 * (signed_in, not a database role), player, and every role an admin can grant.
 */
export const MANUAL_ROLES = ["member", "signed_in", "player", ...ASSIGNABLE_ROLES];

/** Where `npm run screenshots` puts the pictures of the manual (gitignored); the build copies them to handbuch/img/. */
export const SCREENSHOTS = new URL("../.screenshots/", import.meta.url).pathname;
/** The screenshots are taken at this device scale factor (screenshots/run.ts), so the page shows them at half their pixels. */
const SCALE = 2;

/**
 * Pictures are written ![Alt-Text](img/<name>.png) on a line of their own. One whose file the screenshot
 * run has not made (a local build) is left out; the others get their size, so the page does not jump while loading.
 */
function pictures(html: string, imageDir: string): string {
  return html.replace(/<p><img src="img\/([a-z0-9-]+)\.png" alt="([^"]*)"[^>]*><\/p>\n?/g, (_, name, alt) => {
    const file = join(imageDir, `${name}.png`);
    if (!existsSync(file)) return "";
    const head = readFileSync(file).subarray(16, 24);
    return `<p><img src="img/${name}.png" alt="${alt}" width="${head.readUInt32BE(0) / SCALE}" height="${head.readUInt32BE(4) / SCALE}" loading="lazy"></p>\n`;
  });
}

const NAME = /^(\d+)-([a-z0-9-]+)\.md$/;

/** Reads the manual, one section per feature in file number order. Throws on a bad file, an unknown role or a duplicate slug, so the build fails. */
export function loadManual(dir: string, imageDir = SCREENSHOTS): ManualSection[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  const sections = files.map((file) => {
    const name = NAME.exec(file);
    if (!name) throw new Error(`manual ${file}: name must be <number>-<slug>.md (lowercase, digits, dashes)`);
    const text = readFileSync(join(dir, file), "utf8").trim();
    const front = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (!front) throw new Error(`manual ${file}: needs front matter with "role:"`);
    const field = (key: string) => (new RegExp(`^${key}:(.*)$`, "m").exec(front[1])?.[1] ?? "").trim();
    const role = field("role");
    if (!MANUAL_ROLES.includes(role)) throw new Error(`manual ${file}: unknown role "${role}" (use ${MANUAL_ROLES.join(", ")})`);
    const rest = text.slice(front[0].length).trim();
    const heading = /^# +(.+)$/m.exec(rest);
    if (!heading) throw new Error(`manual ${file}: needs a "# Title" line`);
    const body = rest.slice(heading.index + heading[0].length).trim();
    const permissions = field("permissions").split(",").map((p) => p.trim()).filter(Boolean);
    return { n: Number(name[1]), slug: name[2], role, title: heading[1].trim(), html: pictures(marked.parse(body, { async: false }), imageDir), permissions };
  });
  const dup = sections.find((s, i) => sections.findIndex((o) => o.slug === s.slug) !== i);
  if (dup) throw new Error(`manual: two sections with slug ${dup.slug}`);
  if (!sections.length) throw new Error("manual: no sections");
  // Links between sections are written [text](manual:<slug>); every section is its own page, <slug>.html next to the others.
  const slugs = sections.map((s) => s.slug);
  for (const s of sections) {
    s.html = s.html.replace(/href="manual:([^"]*)"/g, (_, slug) => {
      if (!slugs.includes(slug)) throw new Error(`manual ${s.slug}: manual:${slug} is not a section (use ${slugs.join(", ")})`);
      return `href="${slug}.html"`;
    });
  }
  return sections.sort((a, b) => a.n - b.n).map(({ n: _n, ...s }) => s);
}
