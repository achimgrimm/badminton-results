import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadReleases } from "../src/releases.ts";

function withNotes(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "releases-"));
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("loadReleases: newest first, title, date and Markdown body", () => {
  withNotes(
    {
      "2026-10-01-alt.md": "# Alt\n\nText",
      "2026-11-02-neu.md": "# Neu da\n\nEin **fetter** Punkt:\n\n- eins\n- [zwei](https://example.org)\n",
      "notes.txt": "ignored",
    },
    (dir) => {
      const r = loadReleases(dir);
      assert.deepEqual(r.map((x) => x.id), ["2026-11-02-neu", "2026-10-01-alt"]);
      assert.equal(r[0].title, "Neu da");
      assert.equal(r[0].date, "2026-11-02");
      assert.match(r[0].html, /<strong>fetter<\/strong>/);
      assert.match(r[0].html, /<li><a href="https:\/\/example.org">zwei<\/a><\/li>/);
      assert.doesNotMatch(r[0].html, /Neu da/);
    },
  );
});

test("loadReleases: bad file name or missing title fails", () => {
  withNotes({ "neu.md": "# Neu" }, (dir) => assert.throws(() => loadReleases(dir), /YYYY-MM-DD/));
  withNotes({ "2026-11-02-neu.md": "kein Titel" }, (dir) => assert.throws(() => loadReleases(dir), /Title/));
});

test("loadReleases: missing folder means no releases", () => {
  assert.deepEqual(loadReleases(join(tmpdir(), "does-not-exist-releases")), []);
});

test("loadReleases: roles from front matter, none means everyone", () => {
  withNotes(
    {
      "2026-11-01-a.md": "---\nroles: team_lead, admin\n---\n# A\n\nText",
      "2026-11-02-b.md": "# B\n\nText",
    },
    (dir) => {
      const [b, a] = loadReleases(dir);
      assert.deepEqual(a.roles, ["team_lead", "admin"]);
      assert.equal(a.title, "A");
      assert.doesNotMatch(a.html, /roles/);
      assert.deepEqual(b.roles, []);
    },
  );
});

test("loadReleases: an unknown role fails the build", () => {
  withNotes({ "2026-11-01-a.md": "---\nroles: boss\n---\n# A\n" }, (dir) => {
    assert.throws(() => loadReleases(dir), /unknown role "boss"/);
  });
});
