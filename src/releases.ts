import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

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
}

const NAME = /^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/;

/** Reads all release notes, newest first. Throws on a bad file name or a missing title, so the build fails. */
export function loadReleases(dir: string): Release[] {
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
      const text = readFileSync(join(dir, file), "utf8").trim();
      const heading = /^# +(.+)$/m.exec(text);
      if (!heading) throw new Error(`release note ${file}: needs a "# Title" line`);
      const body = text.slice(heading.index + heading[0].length).trim();
      return { id: file.slice(0, -3), date: name[1], title: heading[1].trim(), html: marked.parse(body, { async: false }) };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
}
