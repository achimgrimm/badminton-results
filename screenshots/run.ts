/**
 * Takes the screenshots of the manual (#70 follow-up): `npm run build`, then `npm run screenshots`.
 * Serves dist/ locally, signs in with a faked Supabase session (mock.ts) and writes .screenshots/<name>.png,
 * which the next build copies into the manual pages. See docs/internals.md.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright-core";
import { STAGE } from "../src/config.ts";
import { SHOTS } from "./shots.ts";
import { mockSupabase, type MockData, type RosterEntry } from "./mock.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const SITE = join(ROOT, "dist");
const OUT = join(ROOT, ".screenshots");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".ics": "text/calendar",
};

if (!existsSync(join(SITE, STAGE ? `stage/${STAGE}` : "", "index.html"))) throw new Error("dist/ is empty: run `npm run build` first");

const server = createServer((req, res) => {
  let file = normalize(join(SITE, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)));
  if (!file.startsWith(SITE)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/${STAGE ? `stage/${STAGE}/` : ""}`;
const siteDir = join(SITE, STAGE ? `stage/${STAGE}` : "");

// The first team that has a match preview with a lineup history
const team = readdirSync(siteDir).filter((d) => existsSync(join(siteDir, d, "vorschau"))).sort()
  .find((d) => readdirSync(join(siteDir, d, "vorschau")).some((f) => f.endsWith(".html")));
if (!team) throw new Error("no team with a match preview in dist/");
const preview = readdirSync(join(siteDir, team, "vorschau")).filter((f) => f.endsWith(".html")).sort()[0];

const html = readFileSync(join(siteDir, team, "vorschau", preview), "utf8");
const roster: RosterEntry[] = JSON.parse(/<script[^>]*id="me-roster"[^>]*>(.*?)<\/script>/s.exec(html)![1]);
const historyAttr = /id="lineup" data-history="([^"]*)"/.exec(html)![1].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const history: Record<string, string[][]> = JSON.parse(historyAttr.replace(/\\\//g, "/"));
// The most played lineup per discipline
const lineup: Record<string, string[]> = Object.fromEntries(Object.entries(history).map(([d, rows]) => [d, rows[0][0] as unknown as string[]]));
const meId = Number(Object.values(lineup)[0][0]);
const me = roster.find((r) => r.person === meId) ?? roster[0];

// The time of the data, so "next match" and the "Neu" marker are the same on every run
const now = new Date(JSON.parse(readFileSync(join(ROOT, "data", "meta.json"), "utf8")).checkedAt);

/**
 * Blurs the names of real people (the club's players from the roster, and the opponents' players, who are links
 * in the "Gegenseite" lines) so the pictures show the feature, not the persons. Names inside a sentence are
 * wrapped one by one ("Du spielst: 1.HD mit <blurred>"), so the rest stays readable.
 */
async function blurNames(page: import("playwright-core").Page, people: RosterEntry[]): Promise<void> {
  // "Nachname, Vorname" as in the roster, and "Vorname Nachname" as the lineup shows it
  const forms = people.flatMap((r) => {
    const [last, first] = r.name.split(", ");
    return first ? [r.name, `${first} ${last}`] : [r.name];
  });
  await page.evaluate((names) => {
    const BLUR = "filter: blur(6px); user-select: none;";
    // No named helper functions in here: tsx adds a __name() call for them, which does not exist in the page
    const re = new RegExp(names.sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = (n as Text).parentElement;
      if (parent && !/^(SCRIPT|STYLE|OPTION|TEXTAREA)$/.test(parent.tagName) && re.test((n as Text).data)) hits.push(n as Text);
      re.lastIndex = 0;
    }
    for (const t of hits) {
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const m of t.data.matchAll(re)) {
        frag.append(t.data.slice(last, m.index));
        const span = document.createElement("span");
        span.setAttribute("style", BLUR);
        span.textContent = m[0];
        frag.append(span);
        last = m.index! + m[0].length;
      }
      frag.append(t.data.slice(last));
      t.replaceWith(frag);
    }
    // The opponents are not in the roster
    document.querySelectorAll<HTMLElement>(".lineup-opp a").forEach((a) => a.setAttribute("style", BLUR));
  }, forms);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const failures: string[] = [];
for (const shot of SHOTS) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, locale: "de-DE", timezoneId: "Europe/Berlin",
      serviceWorkers: "block", colorScheme: "light", reducedMotion: "reduce",
    });
    const unmocked: string[] = [];
    context.setDefaultTimeout(10000);
    try {
      await context.route(/umami|cloud\.umami\.is/, (r) => r.abort());
      await context.clock.setFixedTime(now);
      const data: MockData = { now, roster, history: lineup, me };
      await mockSupabase(context, shot.persona, data, unmocked);
      // Version and "Stand" in the footer change with every build
      await context.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => {
          const s = document.createElement("style");
          s.textContent = "footer { visibility: hidden !important; } .site-header, .tabs, .filter-bar { position: static !important; } *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }";
          document.head.append(s);
        });
      });
      const page = await context.newPage();
      const target = await shot.run({ page, base, team, preview });
      await page.waitForTimeout(300);
      await blurNames(page, roster);
      if (unmocked.length) throw new Error(`unmocked Supabase calls: ${unmocked.join(", ")}`);
      await (target ?? page).screenshot({ path: join(OUT, `${shot.name}.png`) });
      console.log(`ok   ${shot.name}`);
      await context.close();
      break;
    } catch (e) {
      await context.close();
      if (attempt === 2) {
        failures.push(shot.name);
        console.error(`FAIL ${shot.name}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
  }
}
await browser.close();
server.close();
if (failures.length) {
  console.error(`${failures.length} screenshot(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
