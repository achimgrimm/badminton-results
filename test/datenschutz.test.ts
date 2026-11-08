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
