import assert from "node:assert/strict";
import test from "node:test";
import { ONLINE } from "../src/config.ts";
import { PRIVACY_CONTACT, renderDatenschutz } from "../src/render/datenschutz.ts";
import { setTeam } from "../src/render/context.ts";

test("privacy page names the contact and, when online, the Google data and account deletion", () => {
  setTeam(null, []);
  const page = renderDatenschutz(null);
  assert.ok(page.includes(PRIVACY_CONTACT));
  assert.ok(page.includes("Umami"));
  assert.equal(page.includes("Konto löschen"), ONLINE);
  assert.equal(page.includes("openid"), ONLINE);
});

test("every page links the privacy page", () => {
  setTeam(null, []);
  assert.ok(renderDatenschutz(null).includes('href="datenschutz.html"'));
});

test("the auth callback page goes back to the stored page", async () => {
  const { renderAuthCallback } = await import("../src/render/auth-callback.ts");
  setTeam(null, []);
  const page = renderAuthCallback();
  assert.ok(page.includes("auth-return"));
  assert.ok(page.includes('content="noindex"'));
});

test("the privacy page clears every localStorage name the app writes", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { ownsStorageKey, storageKey } = await import("../src/config.ts");
  const dir = new URL("../src/", import.meta.url);
  const files = [...readdirSync(new URL("render/", dir)).map((f) => `render/${f}`), "build.ts"];
  const names = new Set<string>();
  for (const f of files) {
    const text = readFileSync(new URL(f, dir), "utf8");
    for (const m of text.matchAll(/storageKey\(\s*[`"']([^`"'$]+)/g)) names.add(m[1]);
  }
  assert.ok(names.size > 5);
  for (const n of names) assert.ok(ownsStorageKey(storageKey(n)), `${n} is not covered by STORAGE_NAMES/STORAGE_PREFIXES`);
  assert.equal(ownsStorageKey(storageKey("other-app-key")), false);
});
