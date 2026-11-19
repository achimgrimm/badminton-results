import { SEASON_KEY, storageKey } from "../config.ts";
import type { Dataset } from "../data.ts";
import { disciplines, lineupPlayers, MY_POSITION } from "../lineup.ts";
import { displayName } from "./util.ts";

/* Kept out of lineup.ts: the browser bundle (online.js) imports that file and must not pull in config.ts. */
/** Own position in the published lineup, shown in each hero box (signed-in only; the lineup is read from the account). */
export function mineScript(d: Dataset): string {
  const names: Record<number, string> = {};
  for (const s of lineupPlayers(d)) for (const p of s.players) names[p.person] = displayName(p.name);
  return `(function () {
  ${MY_POSITION}
  var NAMES = ${JSON.stringify(names)}, ORDER = ${JSON.stringify(disciplines(d))}, TEAM = ${JSON.stringify(d.own.slug)}, SEASON = ${JSON.stringify(SEASON_KEY)}, PLAY_KEY = ${JSON.stringify(storageKey(`playing-${d.own.slug}-${SEASON_KEY}`))};
  var boxes = Array.prototype.slice.call(document.querySelectorAll(".pub-mine[data-game]")), session = null, lineups = {};
  function render() {
    var me = window.otMe && otMe.get();
    boxes.forEach(function (box) {
      var l = session && lineups[box.dataset.game];
      box.hidden = !l;
      if (!l) return;
      var res = myPosition(l, me, NAMES, ORDER, myAnswer(PLAY_KEY, box.dataset.game));
      box.classList.toggle("pub-mine--out", res.out);
      box.classList.toggle("pub-mine--warn", res.warn);
      box.textContent = res.text;
    });
  }
  function load() {
    if (!session || !Online.publishedLineup) return;
    boxes.forEach(function (box) {
      Online.publishedLineup(TEAM, SEASON, box.dataset.game).then(function (res) {
        if (res === undefined) return;
        lineups[box.dataset.game] = res && res.lineup;
        render();
      }, function () {});
    });
  }
  function whenOnline() {
    if (!window.Online) return;
    Online.onChange(function (s) { session = s; if (!s) lineups = {}; render(); load(); });
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") load(); });
  }
  if (window.Online) whenOnline(); else document.addEventListener("DOMContentLoaded", whenOnline);
  document.addEventListener("ot-playing", render);
})();`;
}
