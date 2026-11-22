import type { Locator, Page } from "playwright-core";
import type { Persona } from "./mock.ts";

/** What a shot can use: the page, and the URLs of the team the pictures are taken for. */
export interface ShotContext {
  page: Page;
  /** Site root with a trailing slash (a stage lives below stage/<name>/) */
  base: string;
  team: string;
  /** File name of a match preview of the team, e.g. heim-xyz.html */
  preview: string;
}

export interface Shot {
  /** File name without .png; the manual refers to it as ![alt](img/<name>.png) */
  name: string;
  persona: Persona;
  /** Opens the page and gets it into the state to show; returns the element to capture, or nothing for the visible screen. */
  run(c: ShotContext): Promise<Locator | void>;
}

/** Opens the menu and waits until the sign-in state is loaded ("Lädt …" is gone). */
async function openMenu(page: Page): Promise<Locator> {
  await page.locator("#menu-btn").click();
  const dialog = page.locator("#menu-dialog");
  await dialog.waitFor({ state: "visible" });
  // online.js fills the account block once the session is known
  await page.locator("#account-actions .menu-item").first().waitFor();
  return dialog;
}

const menuItem = (page: Page, text: string) => page.locator("#menu-dialog .menu-item", { hasText: text }).first();

/** The pictures of the manual. Add one here, then use it in manual/<nn>-<slug>.md. */
export const SHOTS: Shot[] = [
  {
    name: "ergebnisse",
    persona: "member",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
    },
  },
  {
    name: "name-waehlen",
    persona: "member",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/spieler.html#wer-bist-du`);
      const dialog = page.locator("#me-dialog");
      await dialog.waitFor({ state: "visible" });
      return dialog;
    },
  },
  {
    name: "ich-spiele",
    persona: "member",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/spielplan.html`);
      const toggles = page.locator(".play-toggle:visible");
      await toggles.nth(0).click();
      await toggles.nth(1).click();
      await toggles.nth(1).click();
      await toggles.nth(0).scrollIntoViewIfNeeded();
    },
  },
  {
    name: "spielvorschau",
    persona: "player",
    async run({ page, base, team, preview }) {
      // Tall enough for the hero ("Du spielst: …") and the published lineup below it
      await page.setViewportSize({ width: 360, height: 1150 });
      await page.goto(`${base}${team}/vorschau/${preview}`);
      await page.locator(".pub-mine").waitFor({ state: "visible" });
      await page.locator("#published-lineup .pub-body .lineup-row").first().waitFor();
    },
  },
  {
    name: "menue",
    persona: "member",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      return openMenu(page);
    },
  },
  {
    name: "anmelden",
    persona: "member",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      await openMenu(page);
      // Not "Warum anmelden?", which contains the word too
      await page.locator("#menu-dialog .menu-item", { hasText: /^\s*Anmelden\s*$/ }).click();
      const dialog = page.locator(".login-dialog");
      await dialog.waitFor({ state: "visible" });
      return dialog;
    },
  },
  {
    name: "benachrichtigungen",
    persona: "signed_in",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      const dialog = await openMenu(page);
      await page.locator("#account-push").scrollIntoViewIfNeeded();
      return dialog;
    },
  },
  {
    name: "spielende",
    persona: "player",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      return openMenu(page);
    },
  },
  {
    name: "aufstellung",
    persona: "team_lead",
    async run({ page, base, team, preview }) {
      await page.goto(`${base}${team}/vorschau/${preview}`);
      const editor = page.locator("#lineup");
      await editor.locator(":scope > summary").click();
      await editor.locator(".lineup-suggest").click();
      // The first three games and the buttons are enough to show how it works
      await page.addStyleTag({ content: "#lineup > p, #lineup .lineup-row:nth-of-type(n+4) { display: none !important; }" });
      await editor.scrollIntoViewIfNeeded();
      return editor;
    },
  },
  {
    name: "konten",
    persona: "team_lead",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      await openMenu(page);
      await menuItem(page, "Anfragen prüfen").click();
      const dialog = page.locator("#claims-dialog");
      await dialog.locator(".claim-row").first().waitFor();
      return dialog;
    },
  },
  {
    name: "rollen-verwalten",
    persona: "admin",
    async run({ page, base, team }) {
      await page.goto(`${base}${team}/index.html`);
      await openMenu(page);
      await menuItem(page, "Rollen verwalten").click();
      const dialog = page.locator("#roles-dialog");
      await dialog.locator(".user-row").first().waitFor();
      return dialog;
    },
  },
];

export const SHOT_NAMES = SHOTS.map((s) => s.name);
