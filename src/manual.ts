import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "./roles.ts";

/** One role's chapter of the manual, from manual/<n>-<role>.md */
export interface ManualSection {
  /** member, team_lead or admin */
  role: string;
  /** The first "# " line */
  title: string;
  /** The rest of the file as HTML */
  html: string;
  /** Permissions (as in the database) the role adds; checked against the code by the tests */
  permissions: string[];
}

/** The roles with a chapter: everyone (member) plus every role an admin can grant, weakest first. */
export const MANUAL_ROLES = ["member", ...ASSIGNABLE_ROLES];

const NAME = /^\d+-[a-z_]+\.md$/;

/** Reads the manual, one chapter per role in role order. Throws on a bad file, an unknown or missing role, so the build fails. */
export function loadManual(dir: string): ManualSection[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const sections = files.map((file) => {
    if (!NAME.test(file)) throw new Error(`manual ${file}: name must be <number>-<role>.md`);
    const text = readFileSync(join(dir, file), "utf8").trim();
    const front = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (!front) throw new Error(`manual ${file}: needs front matter with "role:"`);
    const field = (key: string) => (new RegExp(`^${key}:(.*)$`, "m").exec(front[1])?.[1] ?? "").trim();
    const role = field("role");
    if (!(role in ROLE_LABELS) || !MANUAL_ROLES.includes(role)) throw new Error(`manual ${file}: unknown role "${role}" (use ${MANUAL_ROLES.join(", ")})`);
    const rest = text.slice(front[0].length).trim();
    const heading = /^# +(.+)$/m.exec(rest);
    if (!heading) throw new Error(`manual ${file}: needs a "# Title" line`);
    const body = rest.slice(heading.index + heading[0].length).trim();
    const permissions = field("permissions").split(",").map((p) => p.trim()).filter(Boolean);
    return { role, title: heading[1].trim(), html: marked.parse(body, { async: false }), permissions };
  });
  const missing = MANUAL_ROLES.filter((r) => !sections.some((s) => s.role === r));
  if (missing.length) throw new Error(`manual: missing chapter for ${missing.join(", ")}`);
  const dup = sections.find((s, i) => sections.findIndex((o) => o.role === s.role) !== i);
  if (dup) throw new Error(`manual: two chapters for role ${dup.role}`);
  return sections;
}
