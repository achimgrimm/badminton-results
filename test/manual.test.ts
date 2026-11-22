import assert from "node:assert/strict";
import { readdirSync, readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MANUAL_ROLES, loadManual } from "../src/manual.ts";
import { renderHandbuch, renderHandbuchSeite } from "../src/render/handbuch.ts";
import { setTeam } from "../src/render/context.ts";
import { SHOT_NAMES } from "../screenshots/shots.ts";

const MANUAL = new URL("../manual/", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "manual-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

test("the manual has one section per feature in file order, every role is covered", () => {
  const sections = loadManual(MANUAL);
  assert.equal(new Set(sections.map((s) => s.slug)).size, sections.length);
  for (const role of MANUAL_ROLES) assert.ok(sections.some((s) => s.role === role), role);
  assert.deepEqual(loadManual(tmp({ "10-b.md": "---\nrole: member\n---\n# B\n", "2-a.md": "---\nrole: member\n---\n# A\n" })).map((s) => s.slug), ["a", "b"]);
});

test("a bad name, role, front matter, title or a duplicate slug fails the build", () => {
  assert.throws(() => loadManual(tmp({ "1-x.md": "---\nrole: boss\n---\n# X\n" })), /unknown role/);
  assert.throws(() => loadManual(tmp({ "member.md": "---\nrole: member\n---\n# X\n" })), /name must be/);
  assert.throws(() => loadManual(tmp({ "1-x.md": "# X\n" })), /front matter/);
  assert.throws(() => loadManual(tmp({ "1-x.md": "---\nrole: member\n---\ntext\n" })), /Title/);
  assert.throws(() => loadManual(tmp({ "1-x.md": "---\nrole: member\n---\n# X\n", "2-x.md": "---\nrole: member\n---\n# Y\n" })), /two sections/);
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

test("links between sections are checked and point to the section's page", () => {
  const dir = tmp({ "1-a.md": "---\nrole: member\n---\n# A\n\nSiehe [B](manual:b).\n", "2-b.md": "---\nrole: member\n---\n# B\n" });
  assert.match(loadManual(dir)[0].html, /<a href="b.html">B<\/a>/);
  assert.throws(() => loadManual(tmp({ "1-a.md": "---\nrole: member\n---\n# A\n\n[x](manual:nix)\n" })), /manual:nix is not a section/);
});

test("the start page links every feature, each has its own page with neighbours, and the menu links to the manual", () => {
  setTeam(null, []);
  const sections = loadManual(MANUAL);
  const index = renderHandbuch(sections, null);
  for (const s of sections) assert.ok(index.includes(`href="handbuch/${s.slug}.html"`), s.slug);
  const [first, second] = sections;
  const page = renderHandbuchSeite(sections, second.slug, null);
  assert.ok(page.includes(`<h1>${second.title}</h1>`) || page.includes(second.title));
  assert.ok(page.includes(`href="${first.slug}.html"`), "previous");
  assert.ok(page.includes('href="../handbuch.html"'), "back link");
  assert.ok(index.includes('href="handbuch.html"'));
});

test("pictures: the manual and screenshots/shots.ts list the same names, each with alt text", () => {
  const used: string[] = [];
  for (const f of readdirSync(MANUAL).filter((f) => f.endsWith(".md"))) {
    for (const m of readFileSync(join(MANUAL, f), "utf8").matchAll(/!\[([^\]]*)\]\(img\/([^)]*)\)/g)) {
      assert.ok(m[1].trim(), `${f}: picture ${m[2]} needs alt text`);
      assert.match(m[2], /^[a-z0-9-]+\.png$/, `${f}: ${m[2]}`);
      used.push(m[2].slice(0, -4));
    }
  }
  assert.deepEqual([...used].sort(), [...SHOT_NAMES].sort());
});

test("pictures: one whose file is missing is left out, a present one gets its size at scale 2", () => {
  const dir = tmp({ "1-a.md": "---\nrole: member\n---\n# A\n\n![Kurz](img/da.png)\n\n![Weg](img/fehlt.png)\n\nText\n" });
  const png = Buffer.alloc(24);
  png.writeUInt32BE(780, 16);
  png.writeUInt32BE(400, 20);
  const images = mkdtempSync(join(tmpdir(), "manual-img-"));
  writeFileSync(join(images, "da.png"), png);
  const [a] = loadManual(dir, images);
  assert.match(a.html, /<a class="manual-pic" href="img\/da.png"[^>]*><img src="img\/da.png" alt="Kurz" width="390" height="200" loading="lazy"><\/a>/);
  assert.doesNotMatch(a.html, /fehlt/);
  assert.doesNotMatch(a.html, /<p><\/p>/);
});
