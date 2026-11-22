import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { ROLE_LABELS } from "./roles.ts";

/** One release note from release-notes/YYYY-MM-DD-<slug>.md */
export interface Release {
  /** File name without .md; newer releases sort later */
  id: string;
  /** ISO date from the file name */
  date: string;
  /** The first "# " line */
  title: string;
  /** The rest of the file as HTML */
  html: string;
  /** Roles the note is relevant for (admin, team_lead, member); empty means everyone */
  roles: string[];
}

const NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

/** Link target in a note's Markdown that points to a manual section: [Aufstellung](manual:aufstellung). */
const MANUAL_LINK = /\]\(manual:([^)\s]*)\)/g;

/**
 * Reads all release notes, newest first. Throws on a bad file name or a missing title, so the build fails.
 * With manualSlugs (the manual's sections), a "manual:<slug>" link to an unknown section fails too; the
 * link stays "manual:<slug>" in the HTML and the page rewrites it to its page handbuch/<slug>.html (see manualLinks).
 */
export function loadReleases(dir: string, manualSlugs?: string[]): Release[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  return files
    .map((file) => {
      const name = NAME.exec(file);
      if (!name) throw new Error(`release note ${file}: name must be YYYY-MM-DD-<slug>.md (lowercase, digits, dashes)`);
      let text = readFileSync(join(dir, file), "utf8").trim();
      // Optional front matter: "---\nroles: admin, team_lead\n---"
      let roles: string[] = [];
      const front = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
      if (front) {
        text = text.slice(front[0].length).trim();
        const line = /^roles:(.*)$/m.exec(front[1]);
        roles = line ? line[1].split(",").map((r) => r.trim()).filter(Boolean) : [];
        const bad = roles.find((r) => !(r in ROLE_LABELS));
        if (bad) throw new Error(`release note ${file}: unknown role "${bad}" (use ${Object.keys(ROLE_LABELS).join(", ")})`);
      }
      const heading = /^# +(.+)$/m.exec(text);
      if (!heading) throw new Error(`release note ${file}: needs a "# Title" line`);
      const body = text.slice(heading.index + heading[0].length).trim();
      if (manualSlugs) {
        for (const m of body.matchAll(MANUAL_LINK)) {
          if (!manualSlugs.includes(m[1])) throw new Error(`release note ${file}: manual:${m[1]} is not a section of the manual (use ${manualSlugs.join(", ")})`);
        }
      }
      return { id: file.slice(0, -3), date: name[1], title: heading[1].trim(), html: marked.parse(body, { async: false }), roles };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}

/** Points the "manual:<slug>" links of a note's HTML to the manual page; assets is the path back to the site root. */
export function manualLinks(html: string, assets: string): string {
  return html.replace(/href="manual:([a-z0-9-]+)"/g, (_, slug) => `href="${assets}handbuch/${slug}.html"`);
}
