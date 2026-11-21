import { storageKey } from "../config.ts";
import type { ManualSection } from "../manual.ts";
import { layout } from "./layout.ts";
import { esc, html } from "./util.ts";

/** Where the client saves the signed-in account (uid, roles); see SAVED_KEY in client/online.ts. */
const ACCOUNT_KEY = `${storageKey("auth")}-account`;

/** Marks the chapters that apply to the reader ("Für Dich"): everyone is a member, a signed-in account also "signed_in", plus the account's roles. Runs again after sign-in via otManualRefilter. */
const MARK_OWN = `(function () {
  function mark() {
    var mine = ["member"];
    try {
      var acc = JSON.parse(localStorage.getItem("${ACCOUNT_KEY}") || "null");
      if (acc && acc.uid) mine = (Array.isArray(acc.roles) ? acc.roles : []).concat("member", "signed_in");
    } catch (e) {}
    document.querySelectorAll("[data-role]").forEach(function (s) {
      var own = mine.indexOf(s.dataset.role) >= 0;
      s.classList.toggle("is-own", own);
      var badge = s.querySelector(".manual-own");
      if (badge) badge.hidden = !own;
    });
  }
  mark();
  window.otManualRefilter = mark;
})();`;

/** The manual: one chapter per role, with the roles that apply to the reader marked. */
export function renderHandbuch(sections: ManualSection[], checkedAt: string | null): string {
  const toc = sections.map((s) => `<a href="#${esc(s.role)}">${esc(s.title)}</a>`).join(" · ");
  const chapters = sections
    .map(
      (s) => html`<section class="card manual-section" id="${esc(s.role)}" data-role="${esc(s.role)}">
      <h2>${esc(s.title)} <span class="badge manual-own" hidden>Für Dich</span></h2>
      ${s.html}
    </section>`,
    )
    .join("\n");
  const body = html`
    <h1>Handbuch</h1>
    <p class="small muted">Was die App kann, je nachdem ob und als wer Du angemeldet bist. Jedes Kapitel baut auf den Kapiteln davor auf. Die Kapitel, die für Dich gelten, sind markiert.</p>
    <p class="small">${toc}</p>
    ${chapters}
  `;
  return layout({ title: "Handbuch", root: "", assets: "", nav: null, checkedAt, body, script: MARK_OWN });
}
