import { storageKey } from "../config.ts";
import { MANUAL_ROLES, type ManualSection } from "../manual.ts";
import { layout } from "./layout.ts";
import { esc, html } from "./util.ts";

/** Where the client saves the signed-in account (uid, roles); see SAVED_KEY in client/online.ts. */
const ACCOUNT_KEY = `${storageKey("auth")}-account`;

/** What each audience is called in the manual, weakest first (same order as MANUAL_ROLES). */
const AUDIENCE: Record<string, string> = {
  member: "Alle",
  signed_in: "Mit Anmeldung",
  player: "Spielende",
  team_lead: "Mannschaftsführung",
  admin: "Admin",
};

/**
 * Greys out the features the reader cannot use yet in the list and says so on their page (signed out, no confirmed name, no role). The
 * roles build on each other, so the reader's rank is the strongest role they have: signed out is 0,
 * signed in 1, then the account's roles. Runs again after sign-in via otManualRefilter.
 */
const MARK_LOCKED = `(function () {
  var ORDER = ${JSON.stringify(MANUAL_ROLES)};
  function mark() {
    var rank = 0;
    try {
      var acc = JSON.parse(localStorage.getItem("${ACCOUNT_KEY}") || "null");
      if (acc && acc.uid) {
        rank = 1;
        (Array.isArray(acc.roles) ? acc.roles : []).forEach(function (r) { rank = Math.max(rank, ORDER.indexOf(r)); });
      }
    } catch (e) {}
    document.querySelectorAll("[data-rank]").forEach(function (el) {
      var locked = Number(el.dataset.rank) > rank;
      el.classList.toggle("is-locked", locked);
      var hint = el.querySelector(".manual-locked-hint");
      if (hint) hint.hidden = !locked;
    });
  }
  mark();
  window.otManualRefilter = mark;

})();`;

const rankOf = (s: ManualSection) => MANUAL_ROLES.indexOf(s.role);

/** The manual's start page: the features grouped by audience; each one opens its own page. */
export function renderHandbuch(sections: ManualSection[], checkedAt: string | null): string {
  const groups = MANUAL_ROLES.map((role) => ({ role, items: sections.filter((s) => s.role === role) })).filter((g) => g.items.length);
  const body = html`
    <h1>Handbuch</h1>
    <p class="small muted">Was die App kann, nach Funktionen geordnet. Wähle eine Funktion. Ausgegraute brauchen eine Anmeldung oder eine Rolle.</p>
    ${groups.map(
      (g) => html`<h2 class="manual-audience-h">${esc(AUDIENCE[g.role] ?? g.role)}</h2>
      <ul class="manual-index card">${g.items
        .map((s) => html`<li><a href="handbuch/${esc(s.slug)}.html" data-rank="${rankOf(s)}">${esc(s.title)}</a></li>`)
        .join("")}</ul>`,
    )}
  `;
  return layout({ title: "Handbuch", root: "", assets: "", nav: null, checkedAt, body, script: MARK_LOCKED });
}

/** One feature of the manual on its own page (handbuch/<slug>.html), with a link back and to the neighbours. */
export function renderHandbuchSeite(sections: ManualSection[], slug: string, checkedAt: string | null): string {
  const i = sections.findIndex((s) => s.slug === slug);
  const s = sections[i];
  const prev = sections[i - 1], next = sections[i + 1];
  const body = html`
    <h1>${esc(s.title)}</h1>
    ${rankOf(s) ? html`<p class="manual-for" data-rank="${rankOf(s)}"><span class="badge badge--outline">${esc(AUDIENCE[s.role] ?? s.role)}</span><span class="small muted manual-locked-hint" hidden> Dafür brauchst Du eine Anmeldung oder diese Rolle.</span></p>` : ""}
    <section class="card manual-section">${s.html}</section>
    <nav class="manual-pager" aria-label="Weitere Funktionen">
      ${prev ? html`<a class="btn" href="${esc(prev.slug)}.html">‹ ${esc(prev.title)}</a>` : "<span></span>"}
      ${next ? html`<a class="btn" href="${esc(next.slug)}.html">${esc(next.title)} ›</a>` : "<span></span>"}
    </nav>
  `;
  return layout({ title: `${s.title} · Handbuch`, root: "../", assets: "../", nav: null, checkedAt, body, script: MARK_LOCKED, back: { href: "../handbuch.html", label: "Handbuch" } });
}
