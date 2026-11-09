/**
 * Online features (Supabase): Google sign-in in the footer. Bundled to online.js by the build and
 * loaded only when ONLINE is set. Everything else in the app works without it. The globals are
 * replaced at build time (see buildOnlineBundle in src/build.ts).
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { roleLabel } from "../roles.ts";
import { displayName as shownName, matchPlayer } from "../names.ts";
import { reconcile, type Pick } from "../claims.ts";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
declare const STORAGE_KEY: string;
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
interface PendingClaim extends ClaimRow { who: string }
let pending: PendingClaim[] = [];
const claimKey = (team: string, season: string) => `${team}|${season}`;

/** The page's "Wer bist Du?" state (ME script in layout.ts); undefined on pages without a team. */
interface MeApi { team: string; season: string; root: string; get(): (Pick & { href?: string }) | null; set(next: Pick | null): void }
const meApi = () => (window as unknown as { otMe?: MeApi }).otMe;
const listeners = new Set<(s: Session | null) => void>();

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
    const me = meApi();
    if (me) {
      writeNote(note("attempt", me.team, me.season), null);
      writeNote(note("automatch", me.team, me.season), null);
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
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`;

/** The menu's user section: #account-who and #account-actions are rendered empty by the layout. */
function renderAccount(): void {
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
    const status = pick && claim?.person === pick.person ? (claim.status === "approved" ? "bestätigt" : "wartet auf Bestätigung") : "";
    if (!pick) lines.push("Kein Spieler gewählt");
    else if (status) lines.push(`Spieler ${status}`);
  }
  const who = block(pick ? nameLine(shownName(pick.name)) : nameLine(accountName), ...lines);
  whoEl.append(who);
  el.append(
    ...(pending.length ? [item(`Anfragen prüfen (${pending.length})`, () => openApprovals())] : []),
    item("Abmelden", () => void Online.signOut(), false, SIGN_OUT_ICON),
    item("Konto löschen", () => {
      if (!confirm("Konto und alle gespeicherten Daten endgültig löschen?")) return;
      Online.deleteAccount().catch(() => alert("Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal."));
    }, true, TRASH_ICON),
  );
}

/** Small per-device notes next to the session, per team and season (never sent anywhere). */
const note = (kind: "attempt" | "automatch", team: string, season: string) => `${STORAGE_KEY}-${kind}-${team}-${season}`;
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
  } else if (!local && !server) await autoMatch(me, s, canApprove);
}

/**
 * Sign-in without a chosen player: the account's name is looked up in the team's roster. It is tried
 * on every load until it finds the player; once one was picked this way it never happens again for
 * this device, team and season, so a pick the user clears later stays cleared.
 */
async function autoMatch(me: MeApi, s: Session, canApprove: boolean): Promise<void> {
  const key = note("automatch", me.team, me.season);
  if (readNote(key)) return;
  const meta = s.user.user_metadata as Record<string, unknown>;
  const accountName = String(meta.full_name ?? meta.name ?? "");
  const hit = matchPlayer(accountName, pageRoster());
  if (!hit) return;
  writeNote(key, "1");
  const pick = { person: hit.person, name: hit.name, ...(hit.href ? { href: hit.href } : {}) };
  me.set(pick);
  track("claim", { action: "automatch" });
  await saveClaim(me.team, me.season, pick, canApprove ? "approved" : "pending");
}

async function loadPending(run: number): Promise<void> {
  if (!permissions.has("player.link")) { pending = []; return; }
  const { data } = await supabase.from("player_claims").select("*").eq("status", "pending").order("created_at");
  const rows = (data ?? []) as ClaimRow[];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const names = ids.length ? (await supabase.from("profiles").select("id, display_name").in("id", ids)).data ?? [] : [];
  if (run !== applied) return;
  const byId = new Map((names as { id: string; display_name: string | null }[]).map((n) => [n.id, n.display_name]));
  pending = rows.filter((r) => r.user_id !== session?.user.id).map((r) => ({ ...r, who: byId.get(r.user_id) ?? "Unbekannt" }));
}

/** Replaces the account's claim for this team and season. A taken player keeps the device pick only. */
async function saveClaim(team: string, season: string, pick: Pick | null, status: "pending" | "approved" = "pending"): Promise<void> {
  if (!session) return;
  const uid = session.user.id;
  await supabase.from("player_claims").delete().eq("user_id", uid).eq("team_slug", team).eq("season", season);
  claims.delete(claimKey(team, season));
  if (pick) {
    const { data, error } = await supabase.from("player_claims")
      .insert({ user_id: uid, team_slug: team, season, person: pick.person, player_name: pick.name, status })
      .select("*").single();
    if (error) {
      if (error.code === "23505") {
        writeNote(note("attempt", team, season), `taken:${pick.person}`);
        alert("Dieser Spieler ist schon mit einem anderen Konto verknüpft. Die Auswahl gilt nur auf diesem Gerät.");
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
  };
  // On failure the footer falls back to the Google name and the user counts as having no permissions.
  void load().catch(() => {}).finally(done);
}

// Fires once with the stored session and again on every sign-in, sign-out and token refresh.
supabase.auth.onAuthStateChange((_event, s) => apply(s));
