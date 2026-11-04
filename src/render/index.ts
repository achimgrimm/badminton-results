import { storageKey } from "../config.ts";
import type { Dataset } from "../data.ts";
import { hallAddress, matchCard, playToggle } from "./components.ts";
import { layout } from "./layout.ts";
import { ownPlayers, pickablePlayers } from "./spieler.ts";
import { esc, formatDate, html, involvesOwn, isOwn, previewHref, todayInBremen } from "./util.ts";

/**
 * Android has no handler for webcal: links, so a tap does nothing there (also in the installed app).
 * There the button subscribes through Google Calendar's "add by URL" link instead, which keeps the
 * feed updated and syncs to the calendar app on the phone.
 */
const CALENDAR = `(function () {
  var btn = document.getElementById("calendar-btn");
  if (!btn) return;
  var android = /Android/i.test(navigator.userAgent);
  if (android) {
    btn.href = "https://calendar.google.com/calendar/r?cid=" + encodeURIComponent(btn.dataset.webcal);
    btn.target = "_blank";
    btn.rel = "noopener";
    document.getElementById("calendar-hint").hidden = false;
  }
  btn.addEventListener("click", function () { otTrack("calendar", { via: android ? "google" : "webcal" }); });
})();`;

const ME_HINT_KEY = storageKey("meHintDismissed");

/**
 * Personal parts of the overview. "Wer bist Du?" hint while no player is chosen (ME sets body
 * data-me before this runs) until dismissed. "Dein nächstes Spiel": the first marked match after the
 * team's next one, as a copy of its card; its toggle forwards to the original, and PLAYING's
 * "ot-playing" event keeps the copy current.
 */
const PERSONAL = `(function () {
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
  var section = document.getElementById("my-next"), more = document.getElementById("more-matches");
  if (!section || !more) return;
  var slot = section.querySelector(".my-next-slot");
  function update() {
    var card = more.querySelector(".match-card.is-playing"), wrap = card && card.closest(".play-wrap");
    slot.textContent = "";
    section.hidden = !wrap;
    if (!wrap) return;
    var copy = wrap.cloneNode(true), original = wrap.querySelector(".play-toggle");
    copy.querySelector(".play-toggle").addEventListener("click", function () { original.click(); });
    slot.appendChild(copy);
  }
  document.addEventListener("ot-playing", update);
  update();
})();`;

export function renderIndex(d: Dataset, now: Date): string {
  const today = todayInBremen(now);
  const own = d.schedule.filter(involvesOwn);
  const upcoming = own.filter((m) => !m.result && m.date >= today);
  const pending = own.filter((m) => !m.result && m.date < today);
  const played = own.filter((m) => m.result).reverse();
  const next = upcoming[0];
  const standing = d.table.find((s) => isOwn(s.team));

  const nextBlock = next
    ? html`<section class="next" aria-labelledby="next-h">
        <h2 id="next-h">${next.date === today ? "Heute" : "Nächstes Spiel"}</h2>
        <div class="when">${esc(formatDate(next.date, true))}${next.time ? `, ${esc(next.time)} Uhr` : ""}</div>
        <div class="vs">${isOwn(next.home) ? `<b>Heim</b> gegen ${esc(next.guest)}` : `<b>Auswärts</b> bei ${esc(next.home)}`}</div>
        ${next.hall ? `<div>${esc(next.hall.name ?? next.hall.code)}</div>` : ""}
        ${next.hall?.location ? `<div class="small">${hallAddress(d.halls[next.hall.location])}</div>` : ""}
        ${next.postponed ? `<p class="small"><span class="badge">verlegt</span> ${esc(next.note)}</p>` : ""}
        <div class="btn-row">
          <a class="btn btn-on-dark" href="${previewHref("", next)}">Zur Vorschau</a>
          ${playToggle(next, "hero")}
        </div>
      </section>`
    : `<section class="next"><h2>Saison</h2><div class="when">Keine weiteren Spiele geplant</div></section>`;

  const myNext = upcoming.length > 1
    ? `<section class="my-next" id="my-next" aria-labelledby="my-next-h" hidden><h2 id="my-next-h">Dein nächstes Spiel</h2><div class="my-next-slot"></div></section>`
    : "";

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
        <div class="stat"><span class="stat-value">${standing.points[0]}:${standing.points[1]}</span><span class="stat-label">Punkte</span></div>
        <div class="stat"><span class="stat-value">${standing.won}-${standing.drawn}-${standing.lost}</span><span class="stat-label">S-U-N</span></div>
      </div>`
    : "";

  const calendar = d.team.webcalUrl
    ? html`<div class="btn-row">
        <a class="btn btn-primary" id="calendar-btn" href="${esc(d.team.webcalUrl)}" data-webcal="${esc(d.team.webcalUrl)}">📅 Spiele in Deinen Kalender</a>
        ${d.team.icalUrl ? `<a class="btn btn-secondary" href="${esc(d.team.icalUrl)}">.ics herunterladen</a>` : ""}
      </div>
      <p class="small muted" id="calendar-hint" hidden>Öffnet Google Kalender. Nach „Hinzufügen“ erscheinen die Spiele in Deiner Kalender-App und bleiben aktuell.</p>`
    : "";

  const body = html`
    ${nextBlock}
    ${myNext}
    ${stats}
    ${meHint}
    ${calendar}
    ${pending.length ? `<h2>Ergebnis offen</h2>${pending.map((m) => matchCard(m, "", { showDate: true, pending: true, toggle: true })).join("")}` : ""}
    ${played.length ? `<h2>Letzte Ergebnisse</h2>${played.map((m) => matchCard(m, "", { showDate: true })).join("")}` : ""}
    ${upcoming.length > 1 ? `<h2>Weitere Spiele</h2><div id="more-matches">${upcoming.slice(1).map((m) => matchCard(m, "", { showDate: true, toggle: true })).join("")}</div>` : ""}
  `;

  return layout({ title: "Übersicht", root: "", nav: "index", checkedAt: d.meta.checkedAt, body, script: CALENDAR + PERSONAL });
}
