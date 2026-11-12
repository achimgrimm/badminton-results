import { STATUS_BADGE, STATUS_LABEL } from "../answers.ts";
import { SEASON_KEY, storageKey } from "../config.ts";
import type { Dataset } from "../data.ts";
import { disciplines, kind, LINEUP_ISSUES, lineupHistory, lineupPlayers, probableOpponents, requiredGender, slots, SUGGEST_LINEUP } from "../lineup.ts";
import { headToHead, lineup, teamForm, type DisciplineLineup, type Tally } from "../stats.ts";
import type { Meeting } from "../types.ts";
import { hallAddress, matchCard, playToggle, teamLogo } from "./components.ts";
import { layout, SHARE_BTN_ICON } from "./layout.ts";
import { opponentDir, playerCard, type PlayerPage } from "./spieler.ts";
import { displayName, esc, formatDate, html, isOwn, opponentOf, outcomeBadge, outcomeFor, ownOutcome, postponedLabel, previewName } from "./util.ts";

/**
 * Lineup editor: one select per player slot, stored per match on the device as { discipline: [person, …] }
 * (saved on every change, errors or not). Warnings come from lineupIssues; sharing sends plain text.
 */
const LINEUP = (key: string, game: { team: string; season: string; game: string }) => `(function () {
  ${LINEUP_ISSUES}
  ${SUGGEST_LINEUP}
  var KEY = "${key}", root = document.getElementById("lineup");
  var rows = Array.prototype.slice.call(root.querySelectorAll(".lineup-row"));
  var box = root.querySelector(".lineup-issues"), names = {}, genders = {}, saved = {};
  /* Team leads signed in (online.js): { person: "yes"|"maybe"|"no" } for this game; null otherwise (local mode). */
  var GAME = ${JSON.stringify(game)}, LABEL = ${JSON.stringify(STATUS_LABEL)}, BADGE = ${JSON.stringify(STATUS_BADGE)}, status = null;
  function badge(p) {
    if (!status || !p || !status[p]) return null;
    var b = document.createElement("span");
    b.className = "badge " + BADGE[status[p]];
    b.textContent = LABEL[status[p]];
    return b;
  }
  root.querySelectorAll("option[value]").forEach(function (o) {
    if (!o.value) return;
    names[o.value] = o.dataset.name;
    if (o.dataset.gender) genders[o.value] = o.dataset.gender;
    o.dataset.label = o.textContent;
  });
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  function read() {
    var out = {};
    rows.forEach(function (r) {
      out[r.dataset.discipline] = Array.prototype.map.call(r.querySelectorAll("select"), function (s) { return s.value || null; });
    });
    return out;
  }
  function any(l) { return Object.keys(l).some(function (d) { return l[d].some(Boolean); }); }
  function games() {
    return rows.map(function (r) {
      return { discipline: r.dataset.discipline, kind: r.dataset.kind, need: r.dataset.need, persons: Array.prototype.map.call(r.querySelectorAll("select"), function (s) { return s.value; }) };
    });
  }
  function render() {
    var issues = lineupIssues(games(), names, genders), count = {};
    games().forEach(function (g) { g.persons.forEach(function (p) { if (p) count[p] = (count[p] || 0) + 1; }); });
    root.querySelectorAll("option[value]").forEach(function (o) {
      if (!o.value) return;
      var busy = count[o.value] >= 2 && !o.parentElement.parentElement.value.match(new RegExp("^" + o.value + "$"));
      o.textContent = o.dataset.label + (busy ? " (2×)" : "");
    });
    rows.forEach(function (r) {
      r.querySelectorAll(".lineup-slot").forEach(function (slot) {
        var sel = slot.querySelector("select"), pick = slot.querySelector(".lineup-pick");
        pick.querySelector("span").textContent = sel.value ? names[sel.value] : "Spieler wählen";
        pick.classList.toggle("is-empty", !sel.value);
        var old = pick.querySelector(".badge"), b = badge(sel.value);
        if (old) old.remove();
        if (b) pick.querySelector("span").after(b);
      });
    });
    if (status) {
      var said = {};
      games().forEach(function (g) {
        g.persons.forEach(function (p) {
          if (p && status[p] === "no" && !said[p]) { said[p] = 1; issues.push(names[p] + " hat für dieses Spiel abgesagt."); }
        });
      });
    }
    box.hidden = false;
    box.className = "lineup-issues" + (issues.length ? " has-issues" : "");
    box.innerHTML = "";
    if (!issues.length) { box.textContent = any(read()) ? "Keine Fehler gefunden." : "Noch niemand aufgestellt."; return; }
    var ul = document.createElement("ul");
    issues.forEach(function (t) { var li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
    box.appendChild(ul);
  }
  /* A native select with 25+ names opens over the field in Chromium, so a click selects at once: use a dialog. */
  var dlg = root.querySelector(".lineup-dialog"), list = dlg.querySelector(".lineup-list"), heading = dlg.querySelector("h2");
  function choose(sel, value) {
    dlg.close();
    sel.value = value;
    sel.dispatchEvent(new Event("change"));
  }
  function section(sel, label, options) {
    if (label) { var h = document.createElement("h3"); h.textContent = label; list.appendChild(h); }
    var ul = document.createElement("ul");
    ul.className = "team-list";
    options.forEach(function (o) {
      var li = document.createElement("li"), b = document.createElement("button"), t = document.createElement("span");
      b.type = "button";
      b.className = "me-option";
      t.className = "team-label";
      t.textContent = o.value ? o.textContent : "Niemand";
      if (o.value === sel.value && o.value) b.setAttribute("aria-current", "true");
      b.addEventListener("click", function () { choose(sel, o.value); });
      b.appendChild(t);
      var st = badge(o.value);
      if (st) b.appendChild(st);
      li.appendChild(b);
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }
  function openPicker(sel, row) {
    heading.textContent = row.dataset.discipline + ": Spieler wählen";
    list.innerHTML = "";
    Array.prototype.forEach.call(sel.children, function (c) {
      if (c.tagName === "OPTGROUP") section(sel, c.label, Array.prototype.slice.call(c.children));
      else if (!c.value && sel.value) section(sel, "", [c]);
    });
    dlg.showModal();
    dlg.scrollTop = 0;
  }
  dlg.querySelector(".dialog-close").addEventListener("click", function () { dlg.close(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  rows.forEach(function (r) {
    r.querySelectorAll(".lineup-slot").forEach(function (slot) {
      slot.querySelector(".lineup-pick").addEventListener("click", function () { openPicker(slot.querySelector("select"), r); });
    });
  });
  rows.forEach(function (r) {
    var sel = r.querySelectorAll("select");
    (saved[r.dataset.discipline] || []).forEach(function (p, i) { if (sel[i] && p) sel[i].value = String(p); });
    sel.forEach(function (s) {
      s.addEventListener("change", function () {
        try { localStorage.setItem(KEY, JSON.stringify(read())); } catch (e) {}
        render();
      });
    });
  });
  if (any(read())) root.open = true;
  render();
  root.querySelector(".lineup-clear").addEventListener("click", function () {
    if (!any(read()) || !confirm("Aufstellung leeren?")) return;
    root.querySelectorAll("select").forEach(function (s) { s.value = ""; });
    try { localStorage.removeItem(KEY); } catch (e) {}
    render();
    otTrack("lineup", { action: "clear" });
  });
  var suggest = root.querySelector(".lineup-suggest");
  if (suggest) {
    var history = {}, suggestTimer = null;
    try { history = JSON.parse(root.dataset.history || "{}"); } catch (e) {}
    suggest.addEventListener("click", function () {
      var input = rows.map(function (r) {
        var sel = r.querySelectorAll("select");
        return {
          discipline: r.dataset.discipline, kind: r.dataset.kind, need: r.dataset.need,
          persons: Array.prototype.map.call(sel, function (s) { return s.value; }),
          allowed: Array.prototype.map.call(sel[0].querySelectorAll("option"), function (o) { return o.value; }).filter(Boolean),
        };
      });
      var blocked = {};
      if (status) Object.keys(status).forEach(function (p) { if (status[p] === "no") blocked[p] = true; });
      var result = suggestLineup(input, history, genders, blocked), filled = 0, open = 0;
      rows.forEach(function (r, i) {
        r.querySelectorAll("select").forEach(function (s, j) {
          var p = result[i][j];
          if (!s.value && p) { s.value = p; filled++; }
          if (!s.value) open++;
        });
      });
      otTrack("lineup", { action: "suggest", filled: filled });
      if (!filled) {
        suggest.textContent = open ? "Kein passender Spieler" : "Alles besetzt";
        clearTimeout(suggestTimer);
        suggestTimer = setTimeout(function () { suggest.textContent = "Vorschlag"; }, 2500);
        return;
      }
      try { localStorage.setItem(KEY, JSON.stringify(read())); } catch (e) {}
      render();
    });
  }
  /* The statuses come from the account (team leads only); without them everything works as before. */
  var loading = false;
  function loadStatus() {
    if (loading || !window.Online || !Online.teamAnswers) return;
    loading = true;
    Online.teamAnswers(GAME.team, GAME.season, GAME.game).then(function (map) {
      loading = false;
      if (!map && !status) return;
      status = map;
      render();
    }, function () { loading = false; });
  }
  function whenOnline() {
    if (!window.Online) return;
    Online.onChange(loadStatus);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") loadStatus(); });
  }
  if (window.Online) whenOnline(); else document.addEventListener("DOMContentLoaded", whenOnline);
  var btn = root.querySelector(".lineup-share"), label = btn.querySelector("span"), timer = null;
  function flash(text) {
    label.textContent = text;
    clearTimeout(timer);
    timer = setTimeout(function () { label.textContent = "Aufstellung teilen"; }, 2500);
  }
  btn.addEventListener("click", function () {
    var lines = [btn.dataset.title, btn.dataset.when, btn.dataset.vs, ""];
    rows.forEach(function (r) {
      var who = Array.prototype.map.call(r.querySelectorAll("select"), function (s) { return s.value ? names[s.value] : "offen"; });
      lines.push(r.dataset.discipline + ": " + who.join(" / "));
    });
    lines.push("", new URL(btn.dataset.href, location.href).href);
    var text = lines.join("\\n"), method = navigator.share ? "share" : navigator.clipboard ? "clipboard" : "prompt";
    otTrack("lineup", { action: "share", method: method });
    if (navigator.share) {
      navigator.share({ title: btn.dataset.title, text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { flash("Kopiert"); }, function () { prompt("Zum Kopieren:", text); });
    } else {
      prompt("Zum Kopieren:", text);
    }
  });
})();`;

const MATCH_HOURS = 3; // same duration as nuLiga's own calendar feed

/** Converts a Europe/Berlin wall-clock time to a UTC Date. */
function berlinToUtc(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const asBerlin = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Berlin" }) + " UTC").getTime();
  return new Date(guess - (asBerlin - guess));
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");

/** A single-event calendar file for one meeting. */
export function renderIcs(d: Dataset, m: Meeting, now: Date): string {
  const hall = m.hall?.location ? d.halls[m.hall.location] : undefined;
  const where = [m.hall?.name ?? m.hall?.code, hall?.address.join(", ")].filter(Boolean).join(": ");
  const timing = m.time
    ? (() => {
        const start = berlinToUtc(m.date, m.time);
        const end = new Date(start.getTime() + MATCH_HOURS * 3600_000);
        return [`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`];
      })()
    : [`DTSTART;VALUE=DATE:${m.date.replace(/-/g, "")}`];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ot-bremen-results//DE",
    "BEGIN:VEVENT",
    `UID:${d.own.slug}-${previewName(m)}@ot-bremen-results`,
    `DTSTAMP:${icsStamp(now)}`,
    ...timing,
    `SUMMARY:${icsText(`${m.home} – ${m.guest}`)}`,
    `DESCRIPTION:${icsText(`${d.own.league}\nHeim: ${m.home}\nGast: ${m.guest}`)}`,
    where ? `LOCATION:${icsText(where)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .filter((line, i, all) => line || i === all.length - 1)
    .join("\r\n");
}

/** "Aufstellung planen": who plays which game; collapsed until used (see LINEUP). */
function lineupEditor(
  d: Dataset,
  m: Meeting,
  home: boolean,
  opponents: DisciplineLineup[],
  nameLink: (name: string, person: number | null | undefined) => string,
): string {
  const sections = lineupPlayers(d);
  /** Herren games offer men, Damen games women; players of unknown gender are offered everywhere. */
  const optionsFor = (need: string | null) => html`<option value="">–</option>${sections.map((s) => {
    const players = s.players.filter((p) => !need || !p.gender || p.gender === need);
    return players.length
      ? html`<optgroup label="${esc(s.label)}">${players.map(
          (p) => `<option value="${p.person}" data-name="${esc(displayName(p.name))}"${p.gender ? ` data-gender="${p.gender}"` : ""}>${esc(displayName(p.name))}</option>`,
        )}</optgroup>`
      : "";
  })}`;
  const games = disciplines(d);
  if (!games.length) return "";
  const when = `${formatDate(m.date)}${m.time ? `, ${m.time} Uhr` : ""}`;
  const vs = home ? `Heim gegen ${m.guest}` : `Auswärts bei ${m.home}`;
  const history = lineupHistory(d);
  const suggest = Object.keys(history).length > 0;
  /** The opponent's usual players of a game (most played first): the most likely one, the rest behind "weitere". */
  const opponentLine = (discipline: string) => {
    const [first, ...more] = probableOpponents(opponents, discipline);
    if (!first) return "";
    const entry = (e: (typeof first)) =>
      `<span class="opp-who">${e.players.map((p, i) => nameLink(p, e.persons[i])).join(" / ")}</span> <span class="rec num">${e.played}× · ${e.won}–${e.lost}</span>`;
    return `<div class="lineup-opp"><span class="muted">Gegner</span> ${entry(first)}${more.length
      ? `<details><summary>weitere</summary>${more.map((e) => `<div>${entry(e)}</div>`).join("")}</details>`
      : ""}</div>`;
  };
  return html`<details class="card fold lineup-editor" id="lineup"${suggest ? ` data-history="${esc(JSON.stringify(history))}"` : ""}>
      <summary>Aufstellung planen</summary>
      <p class="small muted">Unter jedem Spiel steht, wer beim Gegner dieses Spiel bisher meist gespielt hat (aus den Spielberichten). Wer spielt welches Spiel? Bei Herren- und Damenspielen siehst Du nur Herren bzw. Damen (aus den nuLiga-Ranglisten); Spieler ohne bekanntes Geschlecht stehen überall. Fehler werden nur angezeigt, gespeichert wird immer. Die Aufstellung bleibt auf diesem Gerät.</p>
      ${suggest ? `<p class="small muted">„Vorschlag“ füllt freie Plätze mit den Spielern, die diese Spiele bisher meist gespielt haben; neuere Spiele zählen mehr.</p>` : ""}
      ${games.map(
        (g) => html`<div class="lineup-row" data-discipline="${esc(g)}" data-kind="${kind(g)}" data-need="${requiredGender(g) ?? ""}">
          <span class="badge badge--primary">${esc(g)}</span>
          <span class="lineup-selects">${Array.from({ length: slots(g) }, (_, i) =>
            `<span class="lineup-slot"><select hidden aria-hidden="true" tabindex="-1">${optionsFor(requiredGender(g))}</select>`
            + `<button type="button" class="lineup-pick" aria-haspopup="dialog" aria-label="${esc(g)}, Spieler ${i + 1} wählen"><span>Spieler wählen</span></button></span>`)}</span>
          ${opponentLine(g)}
        </div>`,
      )}
      <div class="lineup-issues" role="status" hidden></div>
      <dialog class="team-dialog lineup-dialog" aria-labelledby="lineup-dialog-h">
        <div class="dialog-head">
          <h2 id="lineup-dialog-h">Spieler wählen</h2>
          <button type="button" class="dialog-close" aria-label="Schließen">×</button>
        </div>
        <div class="lineup-list"></div>
      </dialog>
      <div class="btn-row">
        ${suggest ? `<button type="button" class="btn btn-secondary lineup-suggest">Vorschlag</button>` : ""}
        <button type="button" class="btn btn-secondary lineup-clear">Leeren</button>
        <button type="button" class="btn btn-primary lineup-share" data-title="${esc(`Aufstellung · ${m.home} – ${m.guest}`)}" data-when="${esc(when)}" data-vs="${esc(vs)}" data-href="${esc(previewName(m))}.html">${SHARE_BTN_ICON}<span>Aufstellung teilen</span></button>
      </div>
    </details>`;
}

export function renderVorschau(d: Dataset, m: Meeting, opponentPages: PlayerPage[]): string {
  const root = "../";
  const opponent = opponentOf(m);
  const home = isOwn(m.home);
  const hall = m.hall?.location ? d.halls[m.hall.location] : undefined;
  const standing = d.table.find((s) => s.team === opponent);
  const form = teamForm(d.schedule, opponent);
  const h2h = headToHead(d.schedule, d.own.name, opponent);
  const returnMatch = d.schedule.find(
    (x) => x !== m && !x.result && ((x.home === m.guest && x.guest === m.home)),
  );
  const opponentReports = Object.values(d.reports).filter((r) => r.home === opponent || r.guest === opponent);
  const lineups = lineup(opponentReports, opponent);
  const dir = opponentDir(opponent);
  const pageOf = new Map(opponentPages.map((p) => [p.stats.person, p.slug]));
  /** Their record against us, for the card's "gegen uns" note. */
  const vsUs = (p: PlayerPage): Tally => {
    const games = p.stats.log.filter((g) => g.opponentTeam === d.own.name);
    return { played: games.length, won: games.filter((g) => g.outcome === "win").length, lost: games.filter((g) => g.outcome === "loss").length };
  };
  const nameLink = (name: string, person: number | null | undefined) => {
    const page = person != null ? pageOf.get(person) : undefined;
    return page ? `<a href="../${dir}${page}.html">${esc(displayName(name))}</a>` : esc(displayName(name));
  };

  /** 10-second read: the opponent's table position, recent form (oldest to newest) and the last direct meeting. */
  const formChips = [...form].reverse().map((x) => {
    const o = outcomeFor(opponent, x) ?? "draw";
    return `<span class="badge badge--${o}" title="${esc(`${x.home} ${x.result![0]}:${x.result![1]} ${x.guest}`)}">${{ win: "S", draw: "U", loss: "N" }[o]}</span>`;
  });
  const lastH2h = h2h.at(-1);
  const heroFacts = standing || form.length || lastH2h
    ? html`<div class="hero-facts">
        ${standing
          ? html`<div class="hero-stats">
              <div><b>${standing.rank}.</b><span>Platz</span></div>
              <div><b>${standing.points[0]}:${standing.points[1]}</b><span>Punkte</span></div>
              <div><b>${standing.won}-${standing.drawn}-${standing.lost}</b><span>S-U-N</span></div>
            </div>`
          : ""}
        ${form.length ? `<p class="hero-line">Form <span class="form-chips">${formChips.join("")}</span></p>` : ""}
        ${lastH2h ? `<p class="hero-line">Direkter Vergleich ${outcomeBadge(ownOutcome(lastH2h))} ${isOwn(lastH2h.home) ? `${lastH2h.result![0]}:${lastH2h.result![1]}` : `${lastH2h.result![1]}:${lastH2h.result![0]}`}</p>` : ""}
      </div>`
    : "";
  const fold = (title: string, inner: string) => html`<details class="card fold"><summary>${title}</summary>${inner}</details>`;
  const editor = lineupEditor(d, m, home, lineups, nameLink);
  /** The opponent's lineup is part of the editor; the separate fold is only the fallback while no games are known. */
  const opponentLineup = editor ? "" : fold(
    "Aufstellung des Gegners",
    lineups.length
      ? html`<p class="small muted">Aus ${opponentReports.length} Spielbericht${opponentReports.length === 1 ? "" : "en"}: wer in welcher Disziplin gespielt hat, mit Bilanz (S–N).</p>
        <div class="lineups">
          ${lineups.map(
            (l) => html`<article class="lineup">
              <div class="game-head"><span class="badge badge--primary">${esc(l.discipline)}</span></div>
              <ul>
                ${l.entries.map(
                  (e) => html`<li>
                    <span class="who">${e.players.map((p, i) => `<span>${nameLink(p, e.persons[i])}</span>`)}</span>
                    <span class="rec num">${e.played}× · ${e.won}–${e.lost}</span>
                  </li>`,
                )}
              </ul>
            </article>`,
          )}
        </div>`
      : `<p class="small muted">Noch keine Spielberichte.</p>`,
  );
  const opponentRoster = fold(
    "Spieler des Gegners",
    opponentPages.length
      ? html`<p class="small muted">Alle ${opponentPages.length} Spieler, die ${esc(opponent)} bisher eingesetzt hat, nach Einsätzen. Tippe auf einen Namen für Details.</p>
        ${opponentPages.map((p) => playerCard(p.stats, `../${dir}${p.slug}.html`, undefined, vsUs(p)))}`
      : `<p class="small muted">Noch keine Spielberichte.</p>`,
  );

  const body = html`
    <section class="next">
      <h2>Vorschau · ${home ? "Heimspiel" : "Auswärtsspiel"}</h2>
      <div class="when">${esc(formatDate(m.date, true))}${m.time ? `, ${esc(m.time)} Uhr` : ""}</div>
      <div class="vs">${home ? "<b>Heim</b> gegen" : "<b>Auswärts</b> bei"} ${teamLogo(d.clubs, opponent, "../../")}${esc(opponent)}</div>
      ${m.postponed ? `<p class="small"><span class="badge">${esc(postponedLabel(m))}</span></p>` : ""}
      ${heroFacts}
      <div class="btn-row">${playToggle(m, "hero")}</div>
    </section>

    <h2>Anfahrt</h2>
    <div class="card">
      <dl class="facts">
        <dt>Halle</dt><dd>${esc(m.hall?.name ?? m.hall?.code ?? "unbekannt")}</dd>
        ${hall ? `<dt>Adresse</dt><dd>${hallAddress(hall)}</dd>` : ""}
      </dl>
      <div class="btn-row">
        ${hall?.mapsUrl ? `<a class="btn btn-primary" href="${esc(hall.mapsUrl)}" target="_blank" rel="noopener">Route planen</a>` : ""}
        <a class="btn btn-secondary" href="${previewName(m)}.ics" download>Termin speichern</a>
      </div>
    </div>

    <h2>Aufstellung</h2>
    ${editor}
    ${opponentLineup}
    ${opponentRoster}

    <h2>Gegner: ${teamLogo(d.clubs, opponent, "../../")}${esc(opponent)}</h2>
    <h3>Letzte Ergebnisse</h3>
    ${form.length
      ? form.map((x) => matchCard(x, root, { showDate: true, perspective: opponent })).join("")
      : `<p class="muted">Noch keine Ergebnisse.</p>`}

    <h2>Direkter Vergleich</h2>
    ${h2h.length
      ? h2h.map((x) => matchCard(x, root, { showDate: true })).join("")
      : `<p class="muted">Noch kein Spiel in dieser Saison.${
          returnMatch ? ` Das Rückspiel ist am ${esc(formatDate(returnMatch.date))}.` : ""
        }</p>`}
  `;

  return layout({ title: `Vorschau ${m.home} – ${m.guest}`, root, nav: "spielplan", back: { href: `${root}spielplan.html`, label: "Spielplan" }, checkedAt: d.meta.checkedAt, body, script: LINEUP(storageKey(`lineup-${d.own.slug}-${SEASON_KEY}-${previewName(m)}`), { team: d.own.slug, season: SEASON_KEY, game: previewName(m) }) });
}
