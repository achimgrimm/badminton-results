import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataset } from "./data.ts";
import { renderBericht } from "./render/bericht.ts";
import { renderIndex } from "./render/index.ts";
import { renderSpielplan } from "./render/spielplan.ts";
import { renderTabelle } from "./render/tabelle.ts";
import { hasPreview, previewName } from "./render/util.ts";
import { renderIcs, renderVorschau } from "./render/vorschau.ts";

const SRC = new URL(".", import.meta.url).pathname;
const DIST = new URL("../dist/", import.meta.url).pathname;

const d = loadDataset();
if (d.table.length === 0) throw new Error("no data – run `npm run scrape` first");
const now = new Date();

rmSync(DIST, { recursive: true, force: true });
mkdirSync(join(DIST, "bericht"), { recursive: true });
mkdirSync(join(DIST, "vorschau"), { recursive: true });

const write = (file: string, content: string) => writeFileSync(join(DIST, file), content);
write("index.html", renderIndex(d, now));
write("tabelle.html", renderTabelle(d));
write("spielplan.html", renderSpielplan(d, now));
for (const r of Object.values(d.reports)) {
  write(`bericht/${r.meeting}.html`, renderBericht(d, r, d.schedule.find((m) => m.meeting === r.meeting)));
}
const previews = d.schedule.filter(hasPreview);
for (const m of previews) {
  write(`vorschau/${previewName(m)}.html`, renderVorschau(d, m));
  write(`vorschau/${previewName(m)}.ics`, renderIcs(d, m, now));
}
copyFileSync(join(SRC, "styles.css"), join(DIST, "styles.css"));
copyFileSync(join(SRC, "favicon.svg"), join(DIST, "favicon.svg"));
writeFileSync(join(DIST, ".nojekyll"), "");

console.log(`built ${3 + Object.keys(d.reports).length + previews.length} pages into dist/`);
