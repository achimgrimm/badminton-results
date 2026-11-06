import { storageKey } from "../config.ts";
import type { Dataset } from "../data.ts";
import type { Meeting } from "../types.ts";
import { hallAddress, matchCard, playToggle } from "./components.ts";
import { layout } from "./layout.ts";
import { ownPlayers, pickablePlayers } from "./spieler.ts";
import { esc, formatDate, html, involvesOwn, isOwn, postponedLabel, previewHref, todayInBremen } from "./util.ts";

const ME_HINT_KEY = storageKey("meHintDismissed");

/** "Weitere Spiele" shows this many matches after the next one; the rest is a link to the Spielplan. */
const MORE_LIMIT = 3;

/** Played matches older than this many days are left out of the personal overview. */
const RECENT_DAYS = 14;

/**
 * Personal parts of the overview. "Wer bist Du?" hint while no player is chosen (ME sets body
 * data-me before this runs) until dismissed. Once a player is chosen, the overview shows only their
 * matches (.is-playing, see PLAYING): the hero is their next marked match (or "Kein Spiel markiert"),
 * "Weitere Spiele" the marked ones after it, and results only theirs of the last RECENT_DAYS days.
 * Without a chosen player it is the team's view. PLAYING's "ot-playing" event (also fired after ME
 * changes) keeps it current.
 */
const PERSONAL = `(function () {
  var MORE_LIMIT = ${MORE_LIMIT};
  var hint = document.getElementById("me-hint");
  if (hint) {
    var dismissed = null;
    try { dismissed = localStorage.getItem("${ME_HINT_KEY}"); } catch (e) {}
    hint.hidden = !!document.body.dataset.me || !!dismissed;
    hint.querySelector(".dialog-close").addEventListener("click", function () {
      hint.hidden = true;
      try { localStorage.setItem("${ME_HINT_KEY}", "1"); } catch (e) {}
      otTrack("me-hint", { action: "dismiss" });
    });
    hint.querySelector(".btn").addEventListener("click", function () { otTrack("me-hint", { action: "pick" }); });
  }
  function items(list) { return list ? Array.prototype.slice.call(list.querySelectorAll(".ov-item")) : []; }
  function mine(item) { var c = item.querySelector(".match-card"); return !!c && c.classList.contains("is-playing"); }
  function update() {
    var personal = !!document.body.dataset.me;
    var more = document.querySelector('[data-list="more"]'), upcoming = items(more);
    var shown = personal ? upcoming.filter(mine) : upcoming, first = shown[0];
    document.querySelectorAll(".next[data-index]").forEach(function (h) {
      h.hidden = !first || h.dataset.index !== first.dataset.index;
    });
    var none = document.getElementById("next-none");
    if (none) none.hidden = !(personal && !first);
    upcoming.forEach(function (it) { var i = shown.indexOf(it); it.hidden = it === first || i < 0 || i > MORE_LIMIT; });
    if (more) more.hidden = shown.length < 2;
    var all = document.getElementById("more-all");
    if (all) {
      all.hidden = shown.length - 1 <= MORE_LIMIT;
      all.querySelector("a").textContent = "Alle " + shown.length + " Spiele im Spielplan \u2192";
    }
    document.querySelectorAll('[data-list="pending"], [data-list="played"]').forEach(function (list) {
      var any = false;
      items(list).forEach(function (it) {
        it.hidden = personal && (!mine(it) || it.hasAttribute("data-old"));
        if (!it.hidden) any = true;
      });
      list.hidden = !any;
    });
  }
  document.addEventListener("ot-playing", update);
  update();
})();`;

function nextHero(d: Dataset, m: Meeting, i: number, today: string): string {
  return html`<section class="next" data-index="${i}" aria-labelledby="next-h-${i}"${i ? " hidden" : ""}>
    <h2 id="next-h-${i}">${m.date === today ? "Heute" : "Nächstes Spiel"}</h2>
    <div class="when">${esc(formatDate(m.date, true))}${m.time ? `, ${esc(m.time)} Uhr` : ""}</div>
    <div class="vs">${isOwn(m.home) ? `<b>Heim</b> gegen ${esc(m.guest)}` : `<b>Auswärts</b> bei ${esc(m.home)}`}</div>
    ${m.hall ? `<div>${esc(m.hall.name ?? m.hall.code)}</div>` : ""}
    ${m.hall?.location ? `<div class="small">${hallAddress(d.halls[m.hall.location])}</div>` : ""}
    ${m.postponed ? `<p class="small"><span class="badge">${esc(postponedLabel(m))}</span></p>` : ""}
    <div class="btn-row">
      <a class="btn btn-on-dark" href="${previewHref("", m)}">Zur Vorschau</a>
      ${playToggle(m, "hero")}
    </div>
  </section>`;
}

/** A titled list of match cards; each card is wrapped so the PERSONAL script can show or hide it. */
function matchList(kind: string, title: string, items: string[], hidden = false): string {
  return items.length
    ? `<section class="ov-list" data-list="${kind}"${hidden ? " hidden" : ""}><h2>${title}</h2>${items.join("")}</section>`
    : "";
}

export function renderIndex(d: Dataset, now: Date): string {
  const today = todayInBremen(now);
  const cutoff = todayInBremen(new Date(now.getTime() - RECENT_DAYS * 864e5));
  const own = d.schedule.filter(involvesOwn);
  const upcoming = own.filter((m) => !m.result && m.date >= today);
  const pending = own.filter((m) => !m.result && m.date < today);
  const played = own.filter((m) => m.result).reverse();
  const standing = d.table.find((s) => isOwn(s.team));
  const item = (m: Meeting, card: string, attrs = "") =>
    `<div class="ov-item"${m.date < cutoff ? " data-old" : ""}${attrs}>${card}</div>`;

  const nextBlock = upcoming.length
    ? upcoming.map((m, i) => nextHero(d, m, i, today)).join("") +
      html`<section class="next" id="next-none" hidden>
        <h2>Nächstes Spiel</h2>
        <div class="when">Kein Spiel markiert</div>
        <p>Markiere im Spielplan, bei welchen Spielen Du dabei bist.</p>
        <div class="btn-row"><a class="btn btn-on-dark" href="spielplan.html">Spiele markieren</a></div>
      </section>`
    : `<section class="next"><h2>Saison</h2><div class="when">Keine weiteren Spiele geplant</div></section>`;

  const meHint = pickablePlayers(d, ownPlayers(d)).length
    ? html`<div class="chrome-hint" id="me-hint" role="note" hidden>
        <p><b>Wer bist Du?</b> Wähle Deinen Namen, dann hebt die App Deine Spiele hervor.</p>
        <a class="btn btn-primary" href="spieler.html#wer-bist-du">Namen wählen</a>
        <button type="button" class="dialog-close" aria-label="Hinweis schließen">×</button>
      </div>`
    : "";

  const stats = standing
    ? html`<div class="stats">
        <a class="stat" href="tabelle.html"><span class="stat-value">${standing.rank}.</span><span class="stat-label">Platz</span></a>
        <a class="stat" href="tabelle.html"><span class="stat-value">${standing.points[0]}:${standing.points[1]}</span><span class="stat-label">Punkte</span></a>
        <a class="stat" href="tabelle.html"><span class="stat-value">${standing.won}-${standing.drawn}-${standing.lost}</span><span class="stat-label">S-U-N</span></a>
      </div>`
    : "";

  // "Weitere Spiele" holds every upcoming match (PERSONAL shows the first few); the first one is in the
  // hero, so its card starts hidden. The link to the full Spielplan is shown when more are left.
  const more = upcoming.map((m, i) =>
    item(m, matchCard(m, "", { showDate: true, toggle: true }), ` data-index="${i}"${i ? "" : " hidden"}`));
  more.push(`<p class="more-all" id="more-all"${upcoming.length - 1 > MORE_LIMIT ? "" : " hidden"}><a href="spielplan.html">Alle ${upcoming.length} Spiele im Spielplan →</a></p>`);

  const body = html`<div class="overview">
    ${nextBlock}
    ${stats}
    ${matchList("pending", "Ergebnis offen", pending.map((m) => item(m, matchCard(m, "", { showDate: true, pending: true, toggle: true }))))}
    ${matchList("played", "Letzte Ergebnisse", played.map((m) => item(m, matchCard(m, "", { showDate: true }))))}
    ${meHint}
    ${matchList("more", "Weitere Spiele", more, upcoming.length < 2)}
  </div>`;

  return layout({ title: "Übersicht", root: "", nav: "index", checkedAt: d.meta.checkedAt, body, script: PERSONAL });
}
