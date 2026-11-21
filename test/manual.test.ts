import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MANUAL_ROLES, loadManual } from "../src/manual.ts";
import { renderHandbuch } from "../src/render/handbuch.ts";
import { setTeam } from "../src/render/context.ts";

const MANUAL = new URL("../manual/", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "manual-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test("the manual has one chapter per role, weakest first", () => {
  assert.deepEqual(loadManual(MANUAL).map((s) => s.role), MANUAL_ROLES);
});

test("a bad role, missing front matter or missing title fails the build", () => {
  assert.throws(() => loadManual(tmp({ "1-x.md": "---\nrole: boss\n---\n# X\n" })), /unknown role/);
  assert.throws(() => loadManual(tmp({ "1-member.md": "# X\n" })), /front matter/);
  assert.throws(() => loadManual(tmp({ "1-member.md": "---\nrole: member\n---\ntext\n" })), /Title/);
  assert.throws(() => loadManual(tmp({ "1-member.md": "---\nrole: member\n---\n# M\n" })), /missing chapter/);
});

test("every permission the app checks is described in a chapter", () => {
  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".ts")) for (const m of readFileSync(join(dir, e.name), "utf8").matchAll(/\b(?:can|has)\("([a-z_]+\.[a-z_]+)"\)/g)) used.add(m[1]);
    }
  };
  walk(SRC);
  assert.ok(used.size > 0, "found no permission checks, is the pattern outdated?");
  const documented = new Set(loadManual(MANUAL).flatMap((s) => s.permissions));
  for (const p of used) assert.ok(documented.has(p), `permission ${p} is used in src/ but not listed under "permissions:" in manual/*.md`);
});

test("the page renders every chapter and the menu links to it", () => {
  setTeam(null, []);
  const page = renderHandbuch(loadManual(MANUAL), null);
  for (const role of MANUAL_ROLES) assert.ok(page.includes(`data-role="${role}"`), role);
  assert.ok(page.includes('href="handbuch.html"'));
});
