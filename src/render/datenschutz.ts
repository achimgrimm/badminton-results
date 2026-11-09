import { CLUB_NAME, ONLINE, STORAGE_NAMES, STORAGE_PREFIXES, SUPABASE_PROJECT_ID, storageKey } from "../config.ts";
import { layout } from "./layout.ts";
import { esc, html } from "./util.ts";

/** Contact and responsible party: a private person, not the club. */
export const PRIVACY_CONTACT = "achim.grimm@posteo.de";

/** The "Lokale Daten löschen" button: removes this build's localStorage keys (see STORAGE_NAMES) after a dialog. */
const CLEAR_LOCAL = () => `(function () {
  var names = ${JSON.stringify(STORAGE_NAMES.map(storageKey))}, prefixes = ${JSON.stringify(STORAGE_PREFIXES.map(storageKey))};
  var btn = document.getElementById("clear-local"), dlg = document.getElementById("clear-local-dialog"), done = document.getElementById("clear-local-done");
  if (!btn || !dlg) return;
  function owned(k) { return names.indexOf(k) >= 0 || prefixes.some(function (p) { return k.indexOf(p) === 0; }); }
  btn.addEventListener("click", function () { dlg.showModal(); });
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.querySelector('[value="cancel"]').addEventListener("click", function () { dlg.close(); });
  dlg.querySelector('[value="clear"]').addEventListener("click", function () {
    var n = 0;
    try {
      Object.keys(localStorage).filter(owned).forEach(function (k) { localStorage.removeItem(k); n++; });
      sessionStorage.removeItem("auth-return");
    } catch (e) {}
    dlg.close();
    done.textContent = n ? "Fertig: " + n + " gespeicherte Einstellungen gelöscht." : "Es waren keine lokalen Daten gespeichert.";
    done.hidden = false;
    otTrack("clear-local-data", { count: String(n) });
  });
})();`;

/** Privacy policy. The sign-in sections only appear when the online features are configured. */
export function renderDatenschutz(checkedAt: string | null): string {
  const mail = `<a href="mailto:${esc(PRIVACY_CONTACT)}">${esc(PRIVACY_CONTACT)}</a>`;
  const body = html`
    <h1>Datenschutzerklärung</h1>
    <p class="small muted">Diese Seite ist eine inoffizielle, private Ansicht der Ergebnisse der Badminton-Mannschaften von ${esc(CLUB_NAME)} (TSV Osterholz-Tenever). Sie wird nicht vom Verein betrieben.</p>

    <h2>Verantwortlicher</h2>
    <p>Verantwortlich für diese Website ist Achim Grimm als Privatperson. Kontakt für alle Fragen zum Datenschutz: ${mail}.</p>

    <h2>Was auf Deinem Gerät bleibt</h2>
    <p>Die App merkt sich Einstellungen auf Deinem Gerät (im lokalen Speicher des Browsers): Deine Mannschaft, das Design, welche Spiele Du markiert hast („Ich spiele“), wer Du bist, geplante Aufstellungen und welche Neuigkeiten Du schon gesehen hast. Diese Daten verlassen Dein Gerät nicht${ONLINE ? ", solange Du Dich nicht anmeldest und nichts anderes dabei steht" : ""}. Du kannst sie jederzeit löschen, indem Du die Website-Daten in Deinem Browser löschst oder hier die lokalen Daten dieser App entfernst${ONLINE ? " (Du wirst dabei auf diesem Gerät auch abgemeldet, Dein Konto bleibt bestehen)" : ""}.</p>
    <p><button type="button" class="btn btn-secondary" id="clear-local">Lokale Daten dieser App löschen</button></p>
    <p class="small muted" id="clear-local-done" role="status" hidden></p>
    <dialog class="team-dialog confirm-dialog" id="clear-local-dialog" aria-labelledby="clear-local-h">
      <h2 id="clear-local-h">Lokale Daten löschen?</h2>
      <p>Mannschaft, Design, markierte Spiele, gewählter Spieler, geplante Aufstellungen und gesehene Neuigkeiten werden auf diesem Gerät gelöscht.${ONLINE ? " Du wirst auf diesem Gerät abgemeldet; Dein Konto und was darin gespeichert ist bleiben bestehen." : ""}</p>
      <div class="btn-row">
        <button type="button" class="btn btn-secondary" value="cancel">Abbrechen</button>
        <button type="button" class="btn btn-danger" value="clear">Löschen</button>
      </div>
    </dialog>

    <h2>Spielergebnisse und Namen</h2>
    <p>Ergebnisse, Tabellen, Spielberichte und Spielernamen stammen aus dem öffentlich zugänglichen Angebot des Bremer Badminton-Verbands auf nuLiga. Die Seite zeigt sie nur an und speichert keine weiteren Daten über die genannten Personen. Wenn Du nicht möchtest, dass Dein Name hier erscheint, wende Dich an den Verband oder an ${mail}.</p>

    <h2>Nutzungsstatistik</h2>
    <p>Wir zählen Seitenaufrufe und einzelne Aktionen (z. B. „Design gewechselt“) mit Umami Cloud. Das geschieht ohne Cookies, ohne Speicherung Deiner IP-Adresse und ohne persönliche Daten, Du wirst nicht über Seiten oder Geräte hinweg wiedererkannt.</p>

    <h2>Schriftarten und Hosting</h2>
    <p>Die Seite liegt bei GitHub Pages (GitHub Inc.). Die Schriftart Source Sans wird von Google Fonts geladen; dabei sieht der Anbieter Deine IP-Adresse. Beim Aufruf der Seite verarbeiten diese Dienste technisch notwendige Verbindungsdaten.</p>

    ${ONLINE
      ? html`<h2>Anmeldung mit Google</h2>
    <p>Die Anmeldung ist freiwillig. Alle bisherigen Funktionen der App gehen auch ohne Anmeldung. Wenn Du Dich mit Google anmeldest, erhalten wir von Google nur diese Angaben über Deinen Account: eine Account-Kennung, Deine E-Mail-Adresse, Deinen Namen und die Adresse Deines Profilbilds (Berechtigungen „openid“, „email“ und „profile“). Dein Google-Passwort sehen wir nie. Dein Profilbild zeigt die App im Menü an; es wird dafür direkt von Google geladen (dabei sieht Google Deine IP-Adresse) und von uns nicht kopiert oder weitergegeben.</p>
    <p>Wir verwenden diese Daten ausschließlich, um Dich anzumelden, Dein Konto wiederzuerkennen und zu entscheiden, ob Du mit Deiner Rolle (Mitglied, Mannschaftsführer oder Administrator) gemeinsame Daten wie Aufstellungen ändern darfst. Sie werden nicht für Werbung genutzt, nicht verkauft und nicht an Dritte weitergegeben. Die Nutzung der von Google erhaltenen Daten entspricht der Google API Services User Data Policy, einschließlich der Anforderungen zur eingeschränkten Nutzung.</p>

    <h2>Gespeicherte Daten im Konto</h2>
    <p>In unserer Datenbank gespeichert werden: Account-Kennung, E-Mail-Adresse, Name, Anmeldezeitpunkte, ein Profil mit Anzeigename (der Name Deines Google-Kontos) und Deine Rolle (jedes Konto ist zunächst „Mitglied“, ein Administrator kann Dich zum Mannschaftsführer oder Administrator machen). Wenn Du angemeldet bist und in der App wählst, welcher Spieler Du bist („Wer bist Du?“), speichern wir diese Auswahl (Mannschaft, Saison, Spieler) mit Deinem Konto, damit sie auf allen Deinen Geräten gilt. Ein Administrator oder Mannschaftsführer bestätigt sie und sieht dafür Deinen Anzeigenamen und, solange die Anfrage offen ist, Deine E-Mail-Adresse; ein Spieler kann nur mit einem Konto verknüpft sein. Ohne Anmeldung bleibt die Auswahl auf Deinem Gerät. Später kommen weitere Daten hinzu, die Du in der App für andere teilst (z. B. Aufstellungen oder Erinnerungen); dann steht es in dieser Erklärung.</p>
    <p>Die Datenbank wird von Supabase betrieben, Projekt ${esc(SUPABASE_PROJECT_ID)}, Serverstandort EU (Frankfurt). Mit Supabase besteht ein Auftragsverarbeitungsverhältnis. Die Anmeldung läuft über Google (Google Ireland Ltd.).</p>

    <h2>Speicherdauer und Konto löschen</h2>
    <p>Wir speichern Dein Konto, bis Du es löschst. Du kannst es jederzeit selbst löschen: im Menü oben rechts auf „Konto löschen“ tippen (nach der Anmeldung sichtbar). Dabei werden Dein Konto und alle damit verknüpften Daten sofort und endgültig gelöscht. Alternativ schreib an ${mail}. Außerdem kannst Du der App den Zugriff auf Dein Google-Konto jederzeit unter <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> entziehen.</p>`
      : ""}

    <h2>Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Du kannst Dich außerdem bei der Landesbeauftragten für Datenschutz und Informationsfreiheit der Freien Hansestadt Bremen beschweren. Schreib dazu an ${mail}.</p>
  `;
  return layout({ title: "Datenschutz", root: "", assets: "", nav: null, checkedAt, body, script: CLEAR_LOCAL() });
}
