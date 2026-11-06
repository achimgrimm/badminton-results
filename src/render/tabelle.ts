import type { Dataset } from "../data.ts";
import { layout } from "./layout.ts";
import { esc, html, isOwn } from "./util.ts";

const SCRIPT = `
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
        <td>${esc(s.team)}</td>
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
