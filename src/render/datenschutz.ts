import { CLUB_NAME, ONLINE, SUPABASE_PROJECT_ID } from "../config.ts";
import { layout } from "./layout.ts";
import { esc, html } from "./util.ts";

/** Contact and responsible party: a private person, not the club. */
export const PRIVACY_CONTACT = "achim.grimm@posteo.de";

/** Privacy policy. The sign-in sections only appear when the online features are configured. */
export function renderDatenschutz(checkedAt: string | null): string {
  const mail = `<a href="mailto:${esc(PRIVACY_CONTACT)}">${esc(PRIVACY_CONTACT)}</a>`;
  const body = html`
    <h1>Datenschutzerklärung</h1>
    <p class="small muted">Diese Seite ist eine inoffizielle, private Ansicht der Ergebnisse der Badminton-Mannschaften von ${esc(CLUB_NAME)} (TSV Osterholz-Tenever). Sie wird nicht vom Verein betrieben.</p>

    <h2>Verantwortlicher</h2>
    <p>Verantwortlich für diese Website ist Achim Grimm als Privatperson. Kontakt für alle Fragen zum Datenschutz: ${mail}.</p>

    <h2>Was auf Deinem Gerät bleibt</h2>
    <p>Die App merkt sich Einstellungen auf Deinem Gerät (im lokalen Speicher des Browsers): Deine Mannschaft, das Design, welche Spiele Du markiert hast („Ich spiele“), wer Du bist, geplante Aufstellungen und welche Neuigkeiten Du schon gesehen hast. Diese Daten verlassen Dein Gerät nicht${ONLINE ? ", solange Du Dich nicht anmeldest und nichts anderes dabei steht" : ""}. Du kannst sie jederzeit löschen, indem Du die Website-Daten in Deinem Browser löschst.</p>

    <h2>Spielergebnisse und Namen</h2>
    <p>Ergebnisse, Tabellen, Spielberichte und Spielernamen stammen aus dem öffentlich zugänglichen Angebot des Bremer Badminton-Verbands auf nuLiga. Die Seite zeigt sie nur an und speichert keine weiteren Daten über die genannten Personen. Wenn Du nicht möchtest, dass Dein Name hier erscheint, wende Dich an den Verband oder an ${mail}.</p>

    <h2>Nutzungsstatistik</h2>
    <p>Wir zählen Seitenaufrufe und einzelne Aktionen (z. B. „Design gewechselt“) mit Umami Cloud. Das geschieht ohne Cookies, ohne Speicherung Deiner IP-Adresse und ohne persönliche Daten, Du wirst nicht über Seiten oder Geräte hinweg wiedererkannt.</p>

    <h2>Schriftarten und Hosting</h2>
    <p>Die Seite liegt bei GitHub Pages (GitHub Inc.). Die Schriftart Source Sans wird von Google Fonts geladen; dabei sieht der Anbieter Deine IP-Adresse. Beim Aufruf der Seite verarbeiten diese Dienste technisch notwendige Verbindungsdaten.</p>

    ${ONLINE
      ? html`<h2>Anmeldung mit Google</h2>
    <p>Die Anmeldung ist freiwillig. Alle bisherigen Funktionen der App gehen auch ohne Anmeldung. Wenn Du Dich mit Google anmeldest, erhalten wir von Google nur diese Angaben über Deinen Account: eine Account-Kennung, Deine E-Mail-Adresse und Deinen Namen (Berechtigungen „openid“, „email“ und „profile“). Dein Google-Passwort sehen wir nie.</p>
    <p>Wir verwenden diese Daten ausschließlich, um Dich anzumelden, Dein Konto wiederzuerkennen und zu entscheiden, ob Du mit Deiner Rolle (Mitglied, Mannschaftsführer oder Administrator) gemeinsame Daten wie Aufstellungen ändern darfst. Sie werden nicht für Werbung genutzt, nicht verkauft und nicht an Dritte weitergegeben. Die Nutzung der von Google erhaltenen Daten entspricht der Google API Services User Data Policy, einschließlich der Anforderungen zur eingeschränkten Nutzung.</p>

    <h2>Gespeicherte Daten im Konto</h2>
    <p>In unserer Datenbank gespeichert werden: Account-Kennung, E-Mail-Adresse, Name, Anmeldezeitpunkte, ein Profil mit Anzeigename (zunächst Dein Google-Name, Du kannst ihn im Menü oben rechts unter „Name ändern“ selbst ändern) und Deine Rolle (jedes Konto ist zunächst „Mitglied“, ein Administrator kann Dich zum Mannschaftsführer oder Administrator machen). Später kommen Daten hinzu, die Du in der App für andere teilst (z. B. Aufstellungen oder Erinnerungen); dann steht es in dieser Erklärung.</p>
    <p>Die Datenbank wird von Supabase betrieben, Projekt ${esc(SUPABASE_PROJECT_ID)}, Serverstandort EU (Frankfurt). Mit Supabase besteht ein Auftragsverarbeitungsverhältnis. Die Anmeldung läuft über Google (Google Ireland Ltd.).</p>

    <h2>Speicherdauer und Konto löschen</h2>
    <p>Wir speichern Dein Konto, bis Du es löschst. Du kannst es jederzeit selbst löschen: im Menü oben rechts auf „Konto löschen“ tippen (nach der Anmeldung sichtbar). Dabei werden Dein Konto und alle damit verknüpften Daten sofort und endgültig gelöscht. Alternativ schreib an ${mail}. Außerdem kannst Du der App den Zugriff auf Dein Google-Konto jederzeit unter <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a> entziehen.</p>`
      : ""}

    <h2>Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Du kannst Dich außerdem bei der Landesbeauftragten für Datenschutz und Informationsfreiheit der Freien Hansestadt Bremen beschweren. Schreib dazu an ${mail}.</p>
  `;
  return layout({ title: "Datenschutz", root: "", assets: "", nav: null, checkedAt, body });
}
