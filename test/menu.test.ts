import assert from "node:assert/strict";
import test from "node:test";
import { ONLINE } from "../src/config.ts";
import { renderDatenschutz } from "../src/render/datenschutz.ts";
import { setReleases, setTeam } from "../src/render/context.ts";

/** A page of the shared layout, split into header, menu dialog and footer. */
function page() {
  setTeam(null, []);
  setReleases([{ id: "2026-11-08-x", date: "2026-11-08", title: "Neu", html: "<p>x</p>" }]);
  const html = renderDatenschutz(null);
  const between = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to, html.indexOf(from)));
  return { html, header: between("<header", "</header>"), menu: between('<dialog class="team-dialog menu-dialog"', "</dialog>"), footer: between("<footer", "</footer>") };
}

test("the header holds only the menu button", () => {
  const { header } = page();
  assert.ok(header.includes('id="menu-btn"'));
  for (const id of ["install-btn", "share-btn", "theme-toggle"]) assert.ok(!header.includes(`id="${id}"`), id);
});

test("the menu holds install, share, theme, release notes and privacy", () => {
  const { menu } = page();
  for (const id of ["install-btn", "share-btn", "theme-toggle", "release-link"]) assert.ok(menu.includes(`id="${id}"`), id);
  assert.ok(menu.includes("datenschutz.html"));
  assert.equal(menu.includes('id="account"'), ONLINE);
});

test("the footer keeps Datenschutz but no longer the release link or the account", () => {
  const { footer } = page();
  assert.ok(footer.includes("datenschutz.html"));
  assert.ok(!footer.includes("release-link"));
  assert.ok(!footer.includes('id="account"'));
});
