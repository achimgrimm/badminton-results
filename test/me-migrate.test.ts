import assert from "node:assert/strict";
import test from "node:test";
import { storageKey } from "../src/config.ts";
import { ME_MIGRATE } from "../src/render/layout.ts";

/** Runs the migration script against a fake localStorage and returns what is left in it. */
function run(slug: string, stored: Record<string, string>): Record<string, string> {
  const data = { ...stored };
  const localStorage = {
    get length() { return Object.keys(data).length; },
    key: (i: number) => Object.keys(data)[i] ?? null,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
  new Function("localStorage", ME_MIGRATE(slug))(localStorage);
  return data;
}

const anna = JSON.stringify({ person: 1, name: "Anna", href: "spieler/anna.html" });
const bob = JSON.stringify({ person: 2, name: "Bob" });
const me = storageKey("me");
const old = (slug: string, season: string) => storageKey(`me-${slug}-${season}`);

test("the per-team pick of this page's team becomes the single pick, without its player page link", () => {
  const left = run("aktive-2", { [old("aktive", "2026-27")]: anna, [old("aktive-2", "2026-27")]: bob, unrelated: "x" });
  assert.deepEqual(Object.keys(left).sort(), [me, "unrelated"].sort());
  assert.deepEqual(JSON.parse(left[me]), { person: 2, name: "Bob" });
});

test("without a pick for this team the first old one is taken; all old keys go", () => {
  const left = run("schueler", { [old("jugend", "2026-27")]: bob, [old("aktive", "2026-27")]: anna });
  assert.deepEqual(JSON.parse(left[me]), { person: 1, name: "Anna" });
  assert.deepEqual(Object.keys(left), [me]);
});

test("an existing single pick is kept and the old keys are still cleaned up", () => {
  const left = run("aktive", { [me]: bob, [old("aktive", "2026-27")]: anna });
  assert.deepEqual(left, { [me]: bob });
});

test("nothing to do without old keys, and broken old values are dropped", () => {
  assert.deepEqual(run("aktive", {}), {});
  assert.deepEqual(run("aktive", { [old("aktive", "2026-27")]: "{broken" }), {});
});
