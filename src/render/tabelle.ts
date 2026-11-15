import type { Dataset } from "../data.ts";
import { layout } from "./layout.ts";
import { esc, html, isOwn } from "./util.ts";

const BELL = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

const SCRIPT = `
var followed = null;
function paintFollow() {
  document.querySelectorAll(".follow").forEach(function (b) {
    var on = !!followed && followed.has(b.dataset.group + "|" + b.dataset.team);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
    b.title = on ? "Du bekommst Nachrichten zu neuen Ergebnissen. Tippen zum Beenden." : "Bei neuem Ergebnis benachrichtigen";
    b.hidden = !followed;
  });
  var mine = document.getElementById("following");
  var names = [];
  if (followed) document.querySelectorAll(".follow.on").forEach(function (b) { names.push(b.dataset.team); });
  mine.hidden = !names.length;
  mine.textContent = "Du folgst: " + names.join(", ");
}
document.querySelectorAll(".follow").forEach(function (b) {
  b.addEventListener("click", function (e) {
    e.stopPropagation();
    var O = window.Online, g = Number(b.dataset.group), t = b.dataset.team;
    if (!O || !followed) return;
    var on = followed.has(g + "|" + t);
    b.disabled = true;
    var done = function (ok, msg) {
      b.disabled = false;
      if (ok) { if (on) followed.delete(g + "|" + t); else followed.add(g + "|" + t); paintFollow(); }
      else if (msg) O.notice({ title: "Mannschaft folgen", text: msg });
    };
    if (on) O.unfollowTeam(g, t).then(function (ok) { done(ok, "Das hat nicht geklappt. Bist Du online?"); });
    else O.followTeam(g, t, location.pathname.split("/").slice(-2).join("/")).then(function (r) {
      done(r === "ok", r === "denied" ? "Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Einstellungen der Seite." : "Das hat nicht geklappt. Bist Du online?");
    });
  });
});
// online.js loads after this script; it calls back now and on every sign-in or sign-out.
function whenOnline() {
  if (!window.Online) return setTimeout(whenOnline, 200);
  if (!window.Online.pushSupported()) return;
  window.Online.onChange(function () {
    window.Online.followedTeams().then(function (f) { followed = f; paintFollow(); });
  });
}
whenOnline();
document.querySelectorAll(".results tr.row").forEach(function (row) {
  row.addEventListener("click", function () {
    var detail = row.nextElementSibling;
    detail.hidden = !detail.hidden;
    row.setAttribute("aria-expanded", String(!detail.hidden));
  });
});`;

export function renderTabelle(d: Dataset): string {
  const rows = d.table.map((s) => {
    const cls = ["row", isOwn(s.team) && "is-own", s.zone && `zone-${s.zone}`].filter(Boolean).join(" ");
    return html`<tr class="${cls}" aria-expanded="false">
        <td class="center">${s.rank}</td>
        <td>${esc(s.team)}${html`<button type="button" class="follow" hidden data-group="${d.own.group}" data-team="${esc(s.team)}" aria-pressed="false" aria-label="Benachrichtigen: ${esc(s.team)}">${BELL}</button>`}</td>
        <td class="num">${s.played}</td>
        <td class="num wide">${s.won}</td>
        <td class="num wide">${s.drawn}</td>
        <td class="num wide">${s.lost}</td>
        <td class="num">${s.games[0]}:${s.games[1]}</td>
        <td class="num wide">${s.sets[0]}:${s.sets[1]}</td>
        <td class="num"><b>${s.points[0]}:${s.points[1]}</b></td>
        <td class="chev" aria-hidden="true"></td>
      </tr>
      <tr class="detail${isOwn(s.team) ? " is-own" : ""}" hidden>
        <td></td>
        <td colspan="4">S-U-N ${s.won}-${s.drawn}-${s.lost} · Sätze ${s.sets[0]}:${s.sets[1]}</td>
      </tr>`;
  });

  const body = html`
    <h1 class="visually-hidden">Tabelle</h1>
    <p class="following" id="following" hidden></p>
    <div class="results-wrap">
      <table class="results">
        <thead><tr>
          <th class="center" scope="col">#</th>
          <th scope="col">Mannschaft</th>
          <th class="num" scope="col" title="Begegnungen">Sp.</th>
          <th class="num wide" scope="col" title="Siege">S</th>
          <th class="num wide" scope="col" title="Unentschieden">U</th>
          <th class="num wide" scope="col" title="Niederlagen">N</th>
          <th class="num" scope="col" title="Gewonnene:verlorene Spiele (Tie-Break)">Spiele</th>
          <th class="num wide" scope="col">Sätze</th>
          <th class="num" scope="col">Punkte</th>
          <th class="chev" scope="col"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="legend">▲ Aufstiegsplatz · ▼ Abstiegsplatz</p>
  `;

  return layout({ title: "Tabelle", root: "", nav: "tabelle", checkedAt: d.meta.checkedAt, body, script: SCRIPT });
}
