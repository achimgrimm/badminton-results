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
  assert.equal(menu.includes('id="account-who"') && menu.includes('id="account-actions"'), ONLINE);
});

test("the footer keeps Datenschutz but no longer the release link or the account", () => {
  const { footer } = page();
  assert.ok(footer.includes("datenschutz.html"));
  assert.ok(!footer.includes("release-link"));
  assert.ok(!footer.includes("account-who") && !footer.includes("account-actions"));
});

test("team pages offer the player pick in the menu, other pages do not", async () => {
  const { layout } = await import("../src/render/layout.ts");
  const team = { slug: "aktive-2", label: "Aktive II", name: "OT Bremen II", league: "Liga", championship: "x", group: 1, teamtable: 1 };
  const render = () => layout({ title: "t", root: "", nav: "index", checkedAt: null, body: "" });
  setTeam(team as never, [team as never]);
  const withTeam = render();
  assert.ok(withTeam.includes('id="menu-pick"'));
  assert.ok(withTeam.includes('href="spieler.html#wer-bist-du"'));
  assert.ok(withTeam.includes('id="menu-stats"') && withTeam.includes('id="menu-clear"'));
  setTeam(null, []);
  assert.ok(!page().menu.includes("menu-pick"));
});

test("analytics sends the session properties and the stub can identify", async () => {
  const { renderDatenschutz: render } = await import("../src/render/datenschutz.ts");
  setTeam(null, []);
  const html = render(null);
  assert.ok(html.includes("function otIdentify("));
});

test("the menu offers feedback by Signal and e-mail, without a phone number", async () => {
  const { PRIVACY_CONTACT, SIGNAL_URL } = await import("../src/config.ts");
  const { menu } = page();
  assert.ok(menu.includes("Feedback / Ideen"));
  assert.ok(menu.includes(`href="${SIGNAL_URL}"`) && menu.includes('target="_blank"'));
  assert.ok(menu.includes(`href="mailto:${PRIVACY_CONTACT}?subject=`));
  assert.ok(!menu.includes("tel:") && !/\+\d{6,}/.test(menu));
});

test("the page carries a CSP that covers every external script and stylesheet it loads", () => {
  const { html } = page();
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html)?.[1];
  assert.ok(csp, "CSP meta tag");
  assert.match(csp, /object-src 'none'/);
  const hosts = new Set([...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="(https:\/\/[^/"]+)/g)].map((m) => m[1]));
  assert.ok(hosts.size > 0);
  for (const host of hosts) {
    assert.ok(csp.includes(host), `${host} is loaded but not allowed by the CSP`);
  }
});
