/**
 * Online features (Supabase): Google sign-in in the footer. Bundled to online.js by the build and
 * loaded only when ONLINE is set. Everything else in the app works without it. The globals are
 * replaced at build time (see buildOnlineBundle in src/build.ts).
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { roleLabel } from "../roles.ts";
import { displayName as shownName, matchPlayer } from "../names.ts";
import { reconcile, type Pick } from "../claims.ts";
import { createSync } from "./sync.ts";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
declare const STORAGE_KEY: string;
/** This build's localStorage names and prefixes (STORAGE_NAMES/STORAGE_PREFIXES in config.ts, with the stage prefix). */
declare const OWN_KEYS: { names: string[]; prefixes: string[] };
declare function otTrack(name: string, data?: Record<string, string>): void;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: STORAGE_KEY, flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

const track = (name: string, data?: Record<string, string>) => {
  try { otTrack(name, data); } catch { /* tracking is optional */ }
};

/** The callback page's URL, from the script tag (relative to the page, so it works under /stage/<name>/). */
const callback = (() => {
  const attr = document.currentScript?.getAttribute("data-callback");
  return attr ? new URL(attr, location.href).href : location.origin + location.pathname;
})();

let session: Session | null = null;
/** The permissions of the signed-in user's roles (RBAC, see supabase/migrations); empty when signed out. */
let permissions: ReadonlySet<string> = new Set();
/** The name from public.profiles (editable by the user) and the user's role names; empty until loaded. */
let displayName: string | null = null;
let roles: readonly string[] = [];
/** The account's chosen players, keyed "team|season" (table player_claims; see supabase/migrations). */
interface ClaimRow { id: string; user_id: string; team_slug: string; season: string; person: number; player_name: string; status: "pending" | "approved" }
let claims = new Map<string, ClaimRow>();
/** For approvers (permission player.link): the claims waiting for a decision, with the claimer's display name. */
interface PendingClaim extends ClaimRow { who: string; email: string }
let pending: PendingClaim[] = [];
const claimKey = (team: string, season: string) => `${team}|${season}`;

/** The page's "Wer bist Du?" state (ME script in layout.ts); undefined on pages without a team. */
interface MeApi { team: string; season: string; root: string; get(): (Pick & { href?: string }) | null; set(next: Pick | null): void; lock?(on: boolean): void }
const meApi = () => (window as unknown as { otMe?: MeApi }).otMe;
const listeners = new Set<(s: Session | null) => void>();

/** The account's answers to the games ("Ich spiele") kept in line with the device; see src/client/sync.ts. */
const sync = createSync({
  supabase,
  prefix: STORAGE_KEY.slice(0, -"auth".length),
  authKey: STORAGE_KEY,
  choose: async () => (await decideDialog({
    title: "Cloud oder lokal?",
    text: "Dein Konto hat schon Antworten zu Spielen, und auf diesem Gerät sind andere gespeichert. Welche sollen gelten? Die anderen werden überschrieben.",
    buttons: [{ label: "Daten vom Konto", value: "cloud", primary: true }, { label: "Daten von diesem Gerät", value: "local" }],
  })) === "local" ? "local" : "cloud",
});
const syncNow = () => void sync.sync(session?.user.id ?? null);
let syncTimer: ReturnType<typeof setTimeout> | undefined;
// An answer given on this page, the connection coming back and returning to the tab all trigger a sync.
document.addEventListener("ot-answers", () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 400); });
window.addEventListener("online", syncNow);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });

export const Online = {
  get session() { return session; },
  get permissions() { return permissions; },
  get displayName() { return displayName; },
  get roles() { return roles; },
  get claims() { return claims; },
  /** Whether the signed-in user may do this, e.g. can("lineup.write"). The server enforces it again. */
  can: (permission: string) => permissions.has(permission),
  signIn: async () => {
    track("login", { provider: "google" });
    // The callback page sends the visitor back to this page afterwards.
    try { sessionStorage.setItem("auth-return", location.href); } catch { /* falls back to the site root */ }
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback } });
  },
  signOut: async () => {
    track("logout");
    // The pick belongs to the account: signing out clears it (and the sign-in notes, so the next login matches afresh).
    // Answers given offline are sent first (best effort), so they are on the account when signing in elsewhere.
    await sync.sync(session?.user.id ?? null).catch(() => {});
    const me = meApi();
    if (me) {
      writeNote(note("attempt", me.team, me.season), null);
      me.set(null);
    }
    await supabase.auth.signOut();
  },
  /** Deletes the account and all its data on the server. */
  deleteAccount: async () => {
    const { error } = await supabase.rpc("delete_account");
    if (error) throw error;
    track("delete-account");
    await supabase.auth.signOut();
  },
  onChange: (fn: (s: Session | null) => void) => { listeners.add(fn); fn(session); },
  client: supabase,
};
(window as unknown as { Online: typeof Online }).Online = Online;

/** The Google "G" in its brand colours, for the sign-in item. */
const GOOGLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>`;

const SIGN_OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const VERIFIED_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8 12.5 2.8 2.8L16 9.5"/></svg>`;
const HELP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>`;
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`;

/** A round avatar: the initials of the name, covered by the picture when it is an https URL that loads. */
function avatar(name: string, url: unknown): HTMLElement {
  const box = document.createElement("span");
  box.className = "avatar";
  box.setAttribute("aria-hidden", "true");
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  box.textContent = initials || "?";
  if (typeof url === "string" && url.startsWith("https://")) {
    const img = document.createElement("img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => img.remove());
    img.src = url;
    box.append(img);
  }
  return box;
}

/** The menu's user section: #account-who and #account-actions are rendered empty by the layout. */
function renderAccount(): void {
  // A count on the header's menu button tells approvers that claims wait for them.
  const menuBtn = document.getElementById("menu-btn");
  if (menuBtn) {
    if (pending.length) menuBtn.dataset.count = String(pending.length); else delete menuBtn.dataset.count;
    menuBtn.setAttribute("aria-label", pending.length ? `Menü, ${pending.length} offene Anfragen` : "Menü");
  }
  const whoEl = document.getElementById("account-who"), el = document.getElementById("account-actions");
  if (!whoEl || !el) return;
  whoEl.textContent = "";
  el.textContent = "";
  // Items that open a prompt or a page close the menu first (data-menu-close, see MENU in layout.ts).
  const item = (text: string, onClick: () => void, danger = false, icon = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = danger ? "menu-item menu-item--danger" : "menu-item";
    b.dataset.menuClose = "";
    if (icon) b.insertAdjacentHTML("afterbegin", icon); // a constant SVG below, never user input
    const label = document.createElement("span");
    label.textContent = text;
    b.append(label);
    b.addEventListener("click", onClick);
    return b;
  };
  const me = meApi();
  const pick = me?.get() ?? null;
  // An approved player can't be cleared on the device ("Ich bin nicht …"), only replaced by another pick.
  const approved = me && session ? claims.get(claimKey(me.team, me.season)) : undefined;
  me?.lock?.(!!pick && approved?.status === "approved" && approved.person === pick.person);
  /** The name line, same look signed in or out: the chosen player, linked to the player page when known. */
  const nameLine = (text: string) => {
    const strong = document.createElement("b");
    if (pick && me && pick.href) {
      const a = document.createElement("a");
      a.href = new URL(me.root + pick.href, location.href).href;
      a.textContent = text;
      strong.append(a);
    } else {
      strong.textContent = text;
    }
    return strong;
  };
  const block = (name: HTMLElement, ...lines: string[]) => {
    const p = document.createElement("p");
    p.className = "menu-account small muted";
    p.append(name);
    for (const l of lines) p.append(document.createElement("br"), l);
    return p;
  };
  if (!session) {
    // A player chosen without an account stays on this device; signed in, the account keeps it.
    if (pick) whoEl.append(block(nameLine(shownName(pick.name)), "Spieler nur auf diesem Gerät"));
    el.append(item("Mit Google anmelden", () => void Online.signIn(), false, GOOGLE_ICON));
    return;
  }
  // With a chosen player the menu shows that player (linked to the player page); otherwise the Google name.
  const meta = session.user.user_metadata as Record<string, unknown>;
  const accountName = displayName ?? String(meta.full_name ?? meta.name ?? session.user.email ?? "Konto");
  const role = roleLabel(roles);
  const lines: string[] = [];
  if (role) lines.push(role);
  if (me) {
    const claim = claims.get(claimKey(me.team, me.season));
    // A confirmed player is shown by the check mark next to the name, so only the waiting state needs words.
    const waiting = pick && claim?.person === pick.person && claim.status !== "approved";
    if (!pick) lines.push("Kein Spieler gewählt");
    else if (waiting) lines.push("Spieler wartet auf Bestätigung");
  }
  const who = block(pick ? nameLine(shownName(pick.name)) : nameLine(accountName), ...lines);
  // A check mark next to the name tells that the chosen player is confirmed.
  if (pick && approved?.status === "approved" && approved.person === pick.person) {
    const mark = document.createElement("span");
    mark.className = "verified";
    mark.title = "Spieler bestätigt";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Spieler bestätigt");
    mark.insertAdjacentHTML("afterbegin", VERIFIED_ICON); // a constant SVG, never user input
    who.firstElementChild?.after(" ", mark);
  }
  // The Google profile picture (user_metadata) next to the name; initials until it loads or when it can't.
  const row = document.createElement("div");
  row.className = "menu-who";
  row.append(avatar(accountName, meta.avatar_url ?? meta.picture), who);
  whoEl.append(row);
  el.append(
    ...(pending.length ? [(() => {
      const b = item("Anfragen prüfen", () => openApprovals(), false, HELP_ICON);
      b.append(Object.assign(document.createElement("span"), { className: "badge badge--new menu-count", textContent: String(pending.length) }));
      return b;
    })()] : []),
    item("Abmelden", () => void Online.signOut().then(offerClearLocalData), false, SIGN_OUT_ICON),
    item("Konto löschen", () => {
      void confirmDeleteAccount().then((yes) => {
        if (yes) Online.deleteAccount().then(offerClearLocalData).catch(() => alert("Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal."));
      });
    }, true, TRASH_ICON),
  );
}

/** A small confirmation dialog; resolves true only on the confirm button, false on cancel, Escape or a click outside. */
function ask(o: { title: string; text: string; cancel: string; ok: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "team-dialog confirm-dialog";
    dlg.setAttribute("aria-labelledby", "ask-h");
    const h = Object.assign(document.createElement("h2"), { id: "ask-h", textContent: o.title });
    const p = Object.assign(document.createElement("p"), { textContent: o.text });
    const row = document.createElement("div");
    row.className = "btn-row";
    const cancel = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-secondary", textContent: o.cancel });
    const ok = Object.assign(document.createElement("button"), { type: "button", className: o.danger ? "btn btn-danger" : "btn btn-primary", textContent: o.ok });
    cancel.addEventListener("click", () => dlg.close("cancel"));
    ok.addEventListener("click", () => dlg.close("ok"));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close("cancel"); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(dlg.returnValue === "ok"); });
    row.append(cancel, ok);
    dlg.append(h, p, row);
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus();
  });
}

/** A dialog that can only be left with one of its buttons (no Escape, no click outside); resolves with the button's value. */
function decideDialog(o: { title: string; text: string; body?: HTMLElement; buttons: { label: string; value: string; primary?: boolean }[] }): Promise<string> {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "team-dialog confirm-dialog";
    dlg.setAttribute("aria-labelledby", "decide-h");
    dlg.addEventListener("cancel", (e) => e.preventDefault());
    const h = Object.assign(document.createElement("h2"), { id: "decide-h", textContent: o.title });
    const p = Object.assign(document.createElement("p"), { textContent: o.text });
    const row = document.createElement("div");
    row.className = "btn-row";
    for (const b of o.buttons) {
      const btn = Object.assign(document.createElement("button"), { type: "button", className: b.primary ? "btn btn-primary" : "btn btn-secondary", textContent: b.label });
      btn.addEventListener("click", () => dlg.close(b.value));
      row.append(btn);
    }
    dlg.addEventListener("close", () => { dlg.remove(); resolve(dlg.returnValue); });
    dlg.append(h, p, ...(o.body ? [o.body] : []), row);
    document.body.append(dlg);
    dlg.showModal();
  });
}

const confirmDeleteAccount = () => ask({
  title: "Konto löschen?",
  text: "Dein Konto und alle damit gespeicherten Daten (Profil, Rolle, gewählter Spieler, Antworten zu Spielen) werden sofort und endgültig gelöscht. Das kann nicht rückgängig gemacht werden.",
  cancel: "Abbrechen", ok: "Konto löschen", danger: true,
});

/** After signing out: offers to also remove what the app keeps on this device (useful on a shared one), then reloads. */
async function offerClearLocalData(): Promise<void> {
  const yes = await ask({
    title: "Lokale Daten löschen?",
    text: "Du bist abgemeldet. Sollen auch die Einstellungen auf diesem Gerät gelöscht werden (Mannschaft, Design, markierte Spiele, geplante Aufstellungen)? Auf einem geteilten Gerät ist das sinnvoll.",
    cancel: "Behalten", ok: "Löschen", danger: true,
  });
  if (!yes) return;
  try {
    Object.keys(localStorage)
      .filter((k) => OWN_KEYS.names.includes(k) || OWN_KEYS.prefixes.some((p) => k.startsWith(p)))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* optional */ }
  track("clear-local-data", { via: "logout" });
  location.reload();
}

/** Small per-device notes next to the session, per team and season (never sent anywhere). */
const note = (kind: "attempt", team: string, season: string) => `${STORAGE_KEY}-${kind}-${team}-${season}`;
const readNote = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const writeNote = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* optional */ }
};
/** The last pick this device sent as a claim ("ok:<person>" or "taken:<person>"). */
function lastAttempt(team: string, season: string): { person: number; ok: boolean } | null {
  const m = /^(ok|taken):(\d+)$/.exec(readNote(note("attempt", team, season)) ?? "");
  return m ? { person: Number(m[2]), ok: m[1] === "ok" } : null;
}

/** The roster the build embeds in team pages: the players one can be matched with. */
function pageRoster(): { person: number; name: string; href: string | null }[] {
  try { return JSON.parse(document.getElementById("me-roster")?.textContent ?? "[]"); } catch { return []; }
}

/** The account's own claims, the pending ones for approvers, and the device's pick brought in line with them. */
async function loadClaims(s: Session, run: number): Promise<void> {
  const own = await supabase.from("player_claims").select("*").eq("user_id", s.user.id);
  if (run !== applied) return;
  claims = new Map(((own.data ?? []) as ClaimRow[]).map((c) => [claimKey(c.team_slug, c.season), c]));
  await loadPending(run);
  const me = meApi();
  if (!me) return;
  const server = claims.get(claimKey(me.team, me.season)) ?? null;
  const local = me.get();
  const canApprove = permissions.has("player.link");
  const result = reconcile(local, server && { person: server.person, name: server.player_name, status: server.status }, canApprove, lastAttempt(me.team, me.season));
  if (result.action === "adopt") me.set(result.pick);
  else if (result.action === "upload") await saveClaim(me.team, me.season, result.pick, result.status);
  else if (result.action === "rejected") {
    writeNote(note("attempt", me.team, me.season), null);
    me.set(null);
    alert(`Deine Anfrage für ${shownName(result.pick.name)} wurde nicht bestätigt. Die Auswahl wurde zurückgesetzt.`);
  } else if (!local && !server) await confirmPlayer(me, s, canApprove, run);
}

/**
 * Sign-in without a chosen player: the account has to say who it is. The Google name is looked up in
 * the team's roster and preselected; the user confirms it or picks another. The pick becomes a normal
 * claim, so it still needs approval. The dialog can only be left by choosing or by signing out.
 */
async function confirmPlayer(me: MeApi, s: Session, canApprove: boolean, run: number, replacing = false): Promise<void> {
  const roster = pageRoster();
  if (!roster.length) return;
  // The page's own list of players would sit behind this dialog; this one replaces it.
  (document.getElementById("me-dialog") as HTMLDialogElement | null)?.close();
  const meta = s.user.user_metadata as Record<string, unknown>;
  const hit = replacing ? null : matchPlayer(String(meta.full_name ?? meta.name ?? ""), roster);
  const current = me.get()?.person;
  const select = document.createElement("select");
  select.className = "select";
  select.setAttribute("aria-label", "Spieler");
  select.append(Object.assign(document.createElement("option"), { value: "", textContent: "Bitte wählen …", selected: !hit, disabled: true }));
  for (const r of [...roster].sort((a, b) => shownName(a.name).localeCompare(shownName(b.name), "de"))) {
    if (replacing && r.person === current) continue;
    select.append(Object.assign(document.createElement("option"), { value: String(r.person), textContent: shownName(r.name), selected: hit?.person === r.person }));
  }
  const body = document.createElement("p");
  body.append(select);
  let chosen: (typeof roster)[number] | undefined;
  while (!chosen) {
    // Signed in there is always a player: the dialog is left by choosing one, or by signing out (when replacing: by cancelling, which changes nothing).
    const answer = await decideDialog({
      title: replacing ? "Neuen Spieler wählen" : "Wer bist Du?",
      text: replacing ? "Wähle den Spieler, der Du stattdessen bist. Erst damit wird die Auswahl geändert." : hit ? "Ist das Dein Name in der Mannschaft? Wähle Deinen Spieler aus." : "Wähle Deinen Spieler aus der Mannschaft.",
      body,
      buttons: [{ label: replacing ? "Abbrechen" : "Abmelden", value: "leave" }, { label: "Bestätigen", value: "ok", primary: true }],
    });
    if (answer === "leave") {
      if (!replacing) await Online.signOut();
      return;
    }
    chosen = roster.find((r) => String(r.person) === select.value);
  }
  if (run !== applied) return;
  const pick = { person: chosen.person, name: chosen.name, ...(chosen.href ? { href: chosen.href } : {}) };
  me.set(pick);
  track("claim", { action: replacing ? "pick" : hit && hit.person === chosen.person ? "automatch" : "pick" });
  await saveClaim(me.team, me.season, pick, canApprove ? "approved" : "pending");
}

// Signed in, "Ich bin nicht …" and toggling the player off can't leave the device without a player (ME script):
// they ask for the new one right away, and nothing changes until one is confirmed.
(window as unknown as { otClearMe: () => boolean }).otClearMe = () => {
  const me = meApi();
  if (!session || !me || !me.get() || !pageRoster().length) return false;
  void confirmPlayer(me, session, permissions.has("player.link"), applied, true);
  return true;
};

async function loadPending(run: number): Promise<void> {
  if (!permissions.has("player.link")) { pending = []; return; }
  const { data } = await supabase.from("player_claims").select("*").eq("status", "pending").order("created_at");
  const rows = (data ?? []) as ClaimRow[];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [names, mails] = ids.length
    ? await Promise.all([supabase.from("profiles").select("id, display_name").in("id", ids), supabase.rpc("pending_claim_emails")])
    : [null, null];
  if (run !== applied) return;
  const byId = new Map(((names?.data ?? []) as { id: string; display_name: string | null }[]).map((n) => [n.id, n.display_name]));
  const emailById = new Map(((mails?.data ?? []) as { user_id: string; email: string | null }[]).map((m) => [m.user_id, m.email ?? ""]));
  pending = rows.filter((r) => r.user_id !== session?.user.id).map((r) => ({ ...r, who: byId.get(r.user_id) ?? "Unbekannt", email: emailById.get(r.user_id) ?? "" }));
}

/** Replaces the account's claim for this team and season. A taken player keeps the device pick only. */
async function saveClaim(team: string, season: string, pick: Pick | null, status: "pending" | "approved" = "pending"): Promise<void> {
  if (!session) return;
  const uid = session.user.id;
  const del = await supabase.from("player_claims").delete().eq("user_id", uid).eq("team_slug", team).eq("season", season);
  if (del.error) console.error("player_claims delete failed", del.error);
  claims.delete(claimKey(team, season));
  if (pick) {
    const { data, error } = await supabase.from("player_claims")
      .insert({ user_id: uid, team_slug: team, season, person: pick.person, player_name: pick.name, status })
      .select("*").single();
    if (error) {
      if (error.code === "23505") {
        writeNote(note("attempt", team, season), `taken:${pick.person}`);
        alert("Dieser Spieler ist schon mit einem anderen Konto verknüpft. Die Auswahl gilt nur auf diesem Gerät.");
      } else {
        // e.g. the table is missing (migration not applied) or a policy refused the row; the pick stays on this device.
        console.error("player_claims insert failed", error);
      }
    } else {
      claims.set(claimKey(team, season), data as ClaimRow);
      writeNote(note("attempt", team, season), `ok:${pick.person}`);
    }
  } else {
    writeNote(note("attempt", team, season), null);
  }
  track("claim", { action: pick ? status : "clear" });
  renderAccount();
}

// The ME script reports every pick made on this device; signed in, it becomes the account's claim.
(window as unknown as { otMeChanged: (pick: Pick | null) => void }).otMeChanged = (pick) => {
  const me = meApi();
  if (!session) { renderAccount(); return; }
  if (!me) return;
  const current = claims.get(claimKey(me.team, me.season));
  if (current && current.status === "approved" && pick?.person !== current.person && !permissions.has("player.link")) {
    if (!confirm("Dein bestätigter Spieler wird ersetzt und muss neu bestätigt werden. Fortfahren?")) {
      me.set({ person: current.person, name: current.player_name });
      return;
    }
  }
  void saveClaim(me.team, me.season, pick, permissions.has("player.link") ? "approved" : "pending").catch(() => {});
};

/** Approvers: a dialog with the waiting claims. Names come from the roster of this page's team when it is the same team. */
function openApprovals(): void {
  let dlg = document.getElementById("claims-dialog") as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "claims-dialog";
    dlg.className = "team-dialog";
    dlg.setAttribute("aria-labelledby", "claims-h");
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg!.close(); });
    document.body.append(dlg);
  }
  const me = meApi();
  const rosterName = (c: ClaimRow) => {
    const opt = me && me.team === c.team_slug ? document.querySelector<HTMLElement>(`.me-option[data-person="${c.person}"]`) : null;
    return opt?.dataset.name ?? c.player_name;
  };
  const teamLabel = (slug: string) => {
    const a = Array.from(document.querySelectorAll<HTMLAnchorElement>("#team-dialog a")).find((l) => l.getAttribute("href")?.startsWith(`${slug}/`) || l.getAttribute("href")?.includes(`/${slug}/`));
    return a?.querySelector(".team-label")?.textContent ?? slug;
  };
  const d = dlg;
  const render = () => {
    d.textContent = "";
    const head = document.createElement("div");
    head.className = "dialog-head";
    const h = document.createElement("h2");
    h.id = "claims-h";
    h.textContent = "Anfragen prüfen";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog-close";
    close.setAttribute("aria-label", "Schließen");
    close.textContent = "×";
    close.addEventListener("click", () => d.close());
    head.append(h, close);
    d.append(head);
    if (!pending.length) {
      const p = document.createElement("p");
      p.textContent = "Keine offenen Anfragen.";
      d.append(p);
    }
    for (const c of pending) {
      const row = document.createElement("div");
      row.className = "claim-row";
      const text = document.createElement("p");
      text.append(Object.assign(document.createElement("b"), { textContent: c.who }), ` möchte ${rosterName(c)} (${teamLabel(c.team_slug)}) sein.`);
      if (c.email) text.append(document.createElement("br"), Object.assign(document.createElement("span"), { className: "small muted", textContent: c.email }));
      const buttons = document.createElement("div");
      buttons.className = "btn-row";
      const decide = (approve: boolean) => async () => {
        const { error } = approve
          ? await supabase.from("player_claims").update({ status: "approved" }).eq("id", c.id)
          : await supabase.from("player_claims").delete().eq("id", c.id);
        if (error) { alert("Das hat nicht geklappt. Bitte versuche es später noch einmal."); return; }
        track("claim-decision", { decision: approve ? "approve" : "reject" });
        pending = pending.filter((x) => x.id !== c.id);
        renderAccount();
        render();
      };
      const yes = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-primary", textContent: "Bestätigen" });
      const no = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-secondary", textContent: "Ablehnen" });
      yes.addEventListener("click", decide(true));
      no.addEventListener("click", decide(false));
      buttons.append(yes, no);
      row.append(text, buttons);
      d.append(row);
    }
  };
  render();
  d.showModal();
}

let applied = 0;
/** Takes over a session change: loads the profile, roles and permissions, shows the account, then tells the listeners. */
function apply(s: Session | null): void {
  const run = ++applied;
  session = s;
  permissions = new Set();
  displayName = null;
  roles = [];
  claims = new Map();
  pending = [];
  const done = () => {
    if (run !== applied) return;
    renderAccount();
    listeners.forEach((fn) => fn(session));
  };
  if (!s) return done();
  // Not awaited inside the auth callback: supabase-js would deadlock on its own lock.
  const load = async () => {
    const [perms, profile, userRoles] = await Promise.all([
      supabase.rpc("my_permissions"),
      supabase.from("profiles").select("display_name").eq("id", s.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", s.user.id),
    ]);
    if (run !== applied) return;
    permissions = new Set(Array.isArray(perms.data) ? (perms.data as string[]) : []);
    displayName = (profile.data as { display_name: string | null } | null)?.display_name ?? null;
    roles = Array.isArray(userRoles.data) ? (userRoles.data as { role: string }[]).map((r) => r.role) : [];
    await loadClaims(s, run);
    if (run === applied) syncNow();
  };
  // On failure the footer falls back to the Google name and the user counts as having no permissions.
  void load().catch(() => {}).finally(done);
}

// Fires once with the stored session and again on every sign-in, sign-out and token refresh.
supabase.auth.onAuthStateChange((_event, s) => apply(s));
