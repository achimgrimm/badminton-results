/**
 * Online features (Supabase): Google sign-in in the footer. Bundled to online.js by the build and
 * loaded only when ONLINE is set. Everything else in the app works without it. The globals are
 * replaced at build time (see buildOnlineBundle in src/build.ts).
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { ASSIGNABLE_ROLES, ROLE_LABELS, canRevokeRole, roleLabel, sortUsers, userLabel, type RoleUser } from "../roles.ts";
import { displayName as shownName, matchPlayer } from "../names.ts";
import { competingClaims, reconcile, type Pick } from "../claims.ts";
import { createSync } from "./sync.ts";
import { cleanCode, cleanEmail, loginProblem } from "./login.ts";
import { VERIFIED_ICON } from "../icons.ts";
import { statusMap } from "../answers.ts";
import { parsePublished, type PublishedLineup } from "../lineup.ts";

declare const SUPABASE_URL: string;
declare const SUPABASE_ANON_KEY: string;
declare const STORAGE_KEY: string;
declare const VAPID_PUBLIC_KEY: string;
/** This build's localStorage names and prefixes (STORAGE_NAMES/STORAGE_PREFIXES in config.ts, with the stage prefix). */
declare const OWN_KEYS: { names: string[]; prefixes: string[] };
declare function otTrack(name: string, data?: Record<string, string>): void;
declare function otIdentify(extra?: Record<string, string>): void;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: STORAGE_KEY, flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

/** True while this page signs the user out on purpose; any other sign-out is unexpected (see onAuthStateChange). */
let signingOut = false;

const track = (name: string, data?: Record<string, string>) => {
  try { otTrack(name, data); } catch { /* tracking is optional */ }
};

/** The callback page's URL, from the script tag (relative to the page, so it works under /stage/<name>/). */
const callback = (() => {
  const attr = document.currentScript?.getAttribute("data-callback");
  return attr ? new URL(attr, location.href).href : location.origin + location.pathname;
})();

/** The account's chosen player: one claim per account, whatever the team (table player_claims; see supabase/migrations). */
interface ClaimRow { id: string; user_id: string; person: number; player_name: string; status: "pending" | "approved" }
/** For approvers (permission player.link): the claims waiting for a decision, with the claimer's display name. */
interface PendingClaim extends ClaimRow { who: string; email: string }

/**
 * Everything the UI knows about the account, in one place. Local and cloud data are not two states:
 * the account is the source of truth and this object is what was last known of it. It is saved as a
 * whole (see commit) and restored as a whole at startup (see hydrate), so an offline start looks
 * exactly like the last online state. Change it only through commit(), which saves and renders.
 */
const state = {
  /** True until supabase-js reports the stored session (first auth event); offline that can take a while. */
  loading: true,
  session: null as Session | null,
  /** The permissions of the signed-in user's roles (RBAC, see supabase/migrations); empty when signed out. */
  permissions: new Set<string>(),
  /** The name from public.profiles (editable by the user) and the user's role names; empty until loaded. */
  displayName: null as string | null,
  /** The account said it is no active player (profiles.not_a_player): the player dialog stays away. */
  notAPlayer: false,
  roles: [] as string[],
  claim: null as ClaimRow | null,
  pending: [] as PendingClaim[],
};
/** The part of the state that supabase-js doesn't persist itself. */
interface Saved { uid: string; displayName: string | null; notAPlayer?: boolean; roles: string[]; permissions: string[]; claim: ClaimRow | null; pending: PendingClaim[] }
const SAVED_KEY = `${STORAGE_KEY}-account`;

function save(): void {
  const s = state.session;
  try {
    if (!s) { localStorage.removeItem(SAVED_KEY); return; }
    const saved: Saved = { uid: s.user.id, displayName: state.displayName, notAPlayer: state.notAPlayer, roles: state.roles, permissions: [...state.permissions], claim: state.claim, pending: state.pending };
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch { /* the saved copy is optional */ }
}

/** Fills the state with what was saved for this user (nothing for another one). */
function hydrate(uid: string): void {
  let saved: Saved | null = null;
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "null"); } catch { /* ignore */ }
  const ok = !!saved && saved.uid === uid && Array.isArray(saved.roles) && Array.isArray(saved.permissions) && Array.isArray(saved.pending);
  state.displayName = ok ? saved!.displayName : null;
  state.notAPlayer = ok ? !!saved!.notAPlayer : false;
  state.roles = ok ? saved!.roles : [];
  state.permissions = new Set(ok ? saved!.permissions : []);
  // An older saved copy had a list of claims (one per team and season); the next load fetches the account's claim.
  state.claim = ok ? saved!.claim ?? null : null;
  state.pending = ok ? saved!.pending : [];
}

/** After every change of the state: keep a copy and show it. */
function commit(): void {
  save();
  renderAccount();
}

/** The session supabase-js persisted, read without waiting for its (possibly network-bound) startup. */
const storedSession = (): Session | null => {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Session | null;
    return s && typeof s === "object" && s.user && typeof s.user.id === "string" ? s : null;
  } catch { return null; }
};

/** The page's "Wer bist Du?" state (ME script in layout.ts); undefined on pages without a team. */
interface MeApi { root: string; get(): (Pick & { href?: string }) | null; set(next: Pick | null): void; lock?(on: boolean): void }
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
const syncNow = () => void sync.sync(state.session?.user.id ?? null);
let syncTimer: ReturnType<typeof setTimeout> | undefined;
// An answer given on this page, the connection coming back and returning to the tab all trigger a sync.
document.addEventListener("ot-answers", () => { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, 400); });
window.addEventListener("online", syncNow);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });

export const Online = {
  /** The app's own message and confirm dialogs, for the inline page scripts (instead of alert / confirm). */
  notice,
  ask,
  get session() { return state.session; },
  get permissions() { return state.permissions; },
  get displayName() { return state.displayName; },
  get roles() { return state.roles; },
  get claim() { return state.claim; },
  /** Whether the signed-in user may do this, e.g. can("lineup.write"). The server enforces it again. */
  can: (permission: string) => state.permissions.has(permission),
  signIn: async () => {
    track("login", { provider: "google" });
    // The callback page sends the visitor back to this page afterwards.
    try { sessionStorage.setItem("auth-return", location.href); } catch { /* falls back to the site root */ }
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback } });
  },
  signOut: async () => {
    signingOut = true;
    track("logout");
    // The pick belongs to the account: signing out clears it (and the sign-in notes, so the next login matches afresh).
    // Answers given offline are sent first (best effort), so they are on the account when signing in elsewhere.
    await sync.sync(state.session?.user.id ?? null).catch(() => {});
    await Online.disablePush().catch(() => {});
    writeNote(ATTEMPT_NOTE, null);
    meApi()?.set(null);
    try { await supabase.auth.signOut(); } finally { signingOut = false; }
  },
  /** Opens the login dialog: e-mail code or Google. */
  openLogin: () => openLogin(),
  /** Deletes the account and all its data on the server. */
  deleteAccount: async () => {
    const { error } = await supabase.rpc("delete_account");
    if (error) throw error;
    track("delete-account");
    signingOut = true;
    try { await supabase.auth.signOut(); } finally { signingOut = false; }
  },
  onChange: (fn: (s: Session | null) => void) => { listeners.add(fn); fn(state.session); },
  /**
   * The players' answers to one game as { person: "yes" | "maybe" | "no" }, for the lineup planning. Only team leads
   * and admins may read them (the server enforces it); null when signed out, not allowed or offline.
   */
  teamAnswers: async (team: string, season: string, gameKey: string) => {
    if (!state.session || !state.permissions.has("answers.read_all")) return null;
    try {
      const { data, error } = await supabase.rpc("team_answers", { p_team: team, p_season: season, p_game_key: gameKey });
      return error ? null : statusMap(data);
    } catch { return null; }
  },
  /**
   * The nuLiga person ids of all verified players (approved claims), to show a check mark after their names.
   * Only team leads and admins may read them (the server enforces it); null when signed out, not allowed or offline.
   */
  verifiedPlayers: async (): Promise<Set<number> | null> => {
    if (!state.session || !state.permissions.has("player.link")) return null;
    try {
      const { data, error } = await supabase.rpc("verified_players");
      return error || !Array.isArray(data) ? null : new Set((data as unknown[]).map(Number));
    } catch { return null; }
  },
  /**
   * The lineup the team lead published for a game: { lineup, at } (at = ms), null when none is published,
   * undefined when it can't be read (signed out, offline).
   */
  publishedLineup: async (team: string, season: string, gameKey: string): Promise<{ lineup: PublishedLineup; at: number } | null | undefined> => {
    if (!state.session) return undefined;
    try {
      const { data, error } = await supabase.from("published_lineups").select("lineup, published_at")
        .eq("team_slug", team).eq("season", season).eq("game_key", gameKey).maybeSingle();
      if (error) return undefined;
      const lineup = parsePublished((data as { lineup: unknown } | null)?.lineup);
      return data && lineup ? { lineup, at: Date.parse((data as { published_at: string }).published_at) } : null;
    } catch { return undefined; }
  },
  /** Publishes the lineup for a game (team leads and admins; the server enforces lineup.write). */
  publishLineup: async (team: string, season: string, gameKey: string, lineup: PublishedLineup, notify?: { match: string; path: string }): Promise<boolean> => {
    if (!state.session || !state.permissions.has("lineup.write")) return false;
    try {
      const { error } = await supabase.from("published_lineups").upsert(
        { team_slug: team, season, game_key: gameKey, lineup, published_by: state.session.user.id, published_at: new Date().toISOString() },
        { onConflict: "team_slug,season,game_key" },
      );
      // Tell the affected players by push (best effort: the lineup is published either way).
      if (!error && notify) void supabase.functions.invoke("notify-lineup", { body: { team, season, game: gameKey, ...notify } }).catch(() => {});
      return !error;
    } catch { return false; }
  },
  /** Withdraws the published lineup of a game. */
  unpublishLineup: async (team: string, season: string, gameKey: string): Promise<boolean> => {
    if (!state.session || !state.permissions.has("lineup.write")) return false;
    try {
      const { error } = await supabase.from("published_lineups").delete().eq("team_slug", team).eq("season", season).eq("game_key", gameKey);
      return !error;
    } catch { return false; }
  },
  /** The teams this account follows for result pushes, as "group|team" keys; null when signed out or offline. */
  followedTeams: async (): Promise<Set<string> | null> => {
    if (!state.session) return null;
    try {
      const { data, error } = await supabase.from("team_subscriptions").select("group_id, team");
      return error ? null : new Set((data ?? []).map((r: { group_id: number; team: string }) => `${r.group_id}|${r.team}`));
    } catch { return null; }
  },
  /** Follows a team (push on new results); turns push on for this device first when it isn't. "path" is the page the push opens. */
  followTeam: async (group: number, team: string, path: string): Promise<"ok" | "denied" | "failed"> => {
    if (!state.session) return "failed";
    if ((await Online.pushState()) !== "on") {
      const r = await Online.enablePush();
      if (r !== "on") return r === "denied" ? "denied" : "failed";
    }
    try {
      const { error } = await supabase.from("team_subscriptions").upsert({ user_id: state.session.user.id, group_id: group, team, path }, { onConflict: "user_id,group_id,team" });
      if (error) return "failed";
      track("follow-team", { action: "on" });
      return "ok";
    } catch { return "failed"; }
  },
  unfollowTeam: async (group: number, team: string): Promise<boolean> => {
    if (!state.session) return false;
    try {
      const { error } = await supabase.from("team_subscriptions").delete().eq("group_id", group).eq("team", team);
      if (!error) track("follow-team", { action: "off" });
      return !error;
    } catch { return false; }
  },
  setReminders: async (on: boolean): Promise<boolean> => {
    if (!state.session) return false;
    try {
      const { error } = await supabase.from("reminder_settings").upsert({ user_id: state.session.user.id, enabled: on }, { onConflict: "user_id" });
      if (!error) track("reminders", { action: on ? "on" : "off" });
      return !error;
    } catch { return false; }
  },
  /** Whether this browser and build can do Web Push (the menu shows the switch only then). */
  pushSupported: () => !!VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  /** "on" = this device is subscribed, "denied" = blocked in the browser, else "off". */
  pushState: async (): Promise<"on" | "off" | "denied"> => {
    if (!Online.pushSupported()) return "off";
    if (Notification.permission === "denied") return "denied";
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      return Notification.permission === "granted" && (await reg?.pushManager.getSubscription()) ? "on" : "off";
    } catch { return "off"; }
  },
  /** Asks for permission, subscribes this device and saves the subscription on the account. */
  enablePush: async (): Promise<"on" | "denied" | "failed"> => {
    if (!state.session || !Online.pushSupported()) return "failed";
    try {
      if ((await Notification.requestPermission()) !== "granted") return "denied";
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(atob(VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
      });
      const j = sub.toJSON();
      const { error } = await supabase.rpc("save_push_subscription", {
        p_endpoint: sub.endpoint, p_p256dh: j.keys?.p256dh ?? "", p_auth: j.keys?.auth ?? "", p_scope: reg.scope,
      });
      if (error) return "failed";
      track("push", { action: "on" });
      return "on";
    } catch { return "failed"; }
  },
  /** Unsubscribes this device and removes the subscription from the account. */
  disablePush: async (): Promise<void> => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    if (state.session) await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe();
    track("push", { action: "off" });
  },
  client: supabase,
};
(window as unknown as { Online: typeof Online }).Online = Online;

/** The Google "G" in its brand colours, for the sign-in item. */
const GOOGLE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg>`;

const SIGN_OUT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`;
const LOGIN_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>`;
const HELP_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>`;
const ROLES_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>`;
const BELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;
const TEAM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-1a5 5 0 0 1 10 0v1M16 5a3 3 0 0 1 0 6M21 20v-1a5 5 0 0 0-3-4.5"/></svg>`;
/** The icon of each role switch in the roles dialog. */
const ROLE_ICONS: Record<(typeof ASSIGNABLE_ROLES)[number], string> = { team_lead: TEAM_ICON, admin: ROLES_ICON };
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`;

/** Appends the check mark after the name of every verified player on the page (own side only: they carry data-person). */
function markVerified(persons: Set<number>): void {
  document.querySelectorAll<HTMLElement>("[data-person]:not(button)").forEach((el) => {
    const target = el.querySelector<HTMLElement>(".player-name") ?? el;
    if (!persons.has(Number(el.dataset.person)) || target.querySelector(":scope > .verified")) return;
    const mark = document.createElement("span");
    mark.className = "verified";
    mark.title = "Verifiziert";
    mark.setAttribute("role", "img");
    mark.setAttribute("aria-label", "Verifiziert");
    mark.innerHTML = VERIFIED_ICON;
    target.append(" ", mark);
  });
}

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
    if (state.pending.length) menuBtn.dataset.count = String(state.pending.length); else delete menuBtn.dataset.count;
    menuBtn.setAttribute("aria-label", state.pending.length ? `Menü, ${state.pending.length} offene Anfragen` : "Menü");
  }
  const whoEl = document.getElementById("account-who"), el = document.getElementById("account-actions");
  if (!whoEl || !el) return;
  whoEl.textContent = "";
  el.textContent = "";
  const pushEl = document.getElementById("account-push"); // in the app section of the menu, filled below when signed in
  if (pushEl) pushEl.textContent = "";
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
  const approved = me && state.session ? state.claim : null;
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
  if (!state.session) {
    if (state.loading) { // not known yet: show neither "signed in" nor "local" options, only that we are waiting
      whoEl.append(Object.assign(document.createElement("p"), { className: "loading", textContent: "Lädt …" }));
      return;
    }
    // A player chosen without an account stays on this device; signed in, the account keeps it.
    if (pick) whoEl.append(block(nameLine(shownName(pick.name)), "Spieler nur auf diesem Gerät"));
    // The explanation only appears when this item is opened, never by itself.
    el.append(
      item("Warum anmelden?", () => {
        void ask({
          title: "Warum anmelden?",
          text: "Ohne Konto bleibt alles auf diesem Gerät. Mit Anmeldung:",
          items: LOGIN_BENEFITS,
          cancel: "Schließen",
          ok: "Anmelden",
        }).then((yes) => { if (yes) openLogin(); });
      }, false, HELP_ICON),
      item("Anmelden", () => openLogin(), false, LOGIN_ICON),
    );
    return;
  }
  // With a chosen player the menu shows that player (linked to the player page); otherwise the Google name.
  const meta = state.session.user.user_metadata as Record<string, unknown>;
  const accountName = state.displayName ?? String(meta.full_name ?? meta.name ?? state.session.user.email ?? "Konto");
  const role = roleLabel(state.roles);
  const lines: string[] = [];
  if (role) lines.push(role);
  if (me) {
    const claim = state.claim;
    // A confirmed player is shown by the check mark next to the name, so only the waiting state needs words.
    const waiting = pick && claim?.person === pick.person && claim.status !== "approved";
    if (!pick) lines.push(state.notAPlayer ? "Kein aktiver Spieler" : "Kein Spieler gewählt");
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
    ...(state.pending.length ? [(() => {
      const b = item("Anfragen prüfen", () => openApprovals(), false, HELP_ICON);
      b.append(Object.assign(document.createElement("span"), { className: "badge badge--new menu-count", textContent: String(state.pending.length) }));
      return b;
    })()] : []),
    ...(state.permissions.has("role.manage") ? [item("Rollen verwalten", () => void openRoles(), false, ROLES_ICON)] : []),
    item("Abmelden", () => void Online.signOut().then(offerClearLocalData), false, SIGN_OUT_ICON),
    item("Konto löschen", () => {
      void confirmDeleteAccount().then((yes) => {
        if (yes) Online.deleteAccount().then(offerClearLocalData).catch(() => notice({ title: "Konto löschen", text: "Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal." }));
      });
    }, true, TRASH_ICON),
  );
  if (pushEl && Online.pushSupported()) pushEl.append(notificationItem(item));
}

/** The one menu switch for notifications: push on this device, with the reminders before "Ich spiele" matches (#21) following it. */
function notificationItem(item: (text: string, onClick: () => void, danger?: boolean, icon?: string) => HTMLButtonElement): HTMLButtonElement {
  let on = false;
  const label = (text: string) => { b.querySelector("span")!.textContent = text; };
  // The label follows the real state of this device; read it again after every switch (the menu isn't re-rendered then).
  const refresh = () => Online.pushState().then((st) => {
    on = st === "on";
    b.disabled = false;
    label(on ? "Benachrichtigungen ausschalten" : "Benachrichtigungen einschalten");
  });
  const b = item("Benachrichtigungen", () => {
    const title = "Benachrichtigungen";
    void (on ? Online.disablePush().then(() => Online.setReminders(false)).then(() => notice({ title, text: "Benachrichtigungen sind auf diesem Gerät aus." }))
      : Online.enablePush().then(async (r) => {
        if (r === "on") await Online.setReminders(true);
        await notice({ title, text: r === "on"
          ? "Du bekommst jetzt eine Nachricht, wenn Deine Aufstellung veröffentlicht oder geändert wird, und 24 Stunden vor einem Spiel, bei dem Du „Ich spiele“ gewählt hast, eine Erinnerung."
          : r === "denied"
            ? "Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Einstellungen der Seite."
            : "Das hat nicht geklappt. Bist Du online?" });
      })).then(refresh, refresh);
  }, false, BELL_ICON);
  b.disabled = true;
  label("Lädt …");
  void refresh().catch(() => { b.disabled = false; label("Benachrichtigungen"); });
  return b;
}

const LOGIN_BENEFITS = [
  "Deine Spielerwahl und „Ich spiele“-Antworten gelten auf allen Geräten.",
  "Du siehst die Aufstellung vom Mannschaftsführer.",
  "Dein Mannschaftsführer sieht bei der Planung Deinen „Ich spiele“-Status.",
  "Du bekommst eine Benachrichtigung, wenn Deine Aufstellung veröffentlicht oder geändert wird.",
  "Du bekommst 24 Stunden vor einem Spiel, bei dem Du „Ich spiele“ gewählt hast, eine Erinnerung.",
  "Du kannst Mannschaften folgen und siehst sie in der Übersicht oben unter „Du folgst“.",
  "Du bekommst eine Benachrichtigung, wenn eine Mannschaft, der Du folgst, ein neues Ergebnis hat.",
];

/** The login dialog: an e-mail address gets a 6-digit code to type in, or sign in with Google. */
function openLogin(): void {
  const dlg = document.createElement("dialog");
  dlg.className = "team-dialog confirm-dialog login-dialog";
  dlg.setAttribute("aria-labelledby", "login-h");
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => dlg.remove());
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Node | string)[]) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };
  const btn = (text: string, cls: string, onClick: () => void) => {
    const b = el("button", { type: "button", className: `btn ${cls}`, textContent: text });
    b.addEventListener("click", onClick);
    return b;
  };
  const problem = el("p", { className: "login-error", hidden: true });
  problem.setAttribute("role", "alert");
  const show = (text: string) => { problem.textContent = text; problem.hidden = !text; };
  const close = el("button", { type: "button", className: "dialog-close", textContent: "×" });
  close.setAttribute("aria-label", "Schließen");
  close.addEventListener("click", () => dlg.close());
  const head = el("div", { className: "dialog-head" }, el("h2", { id: "login-h", textContent: "Anmelden" }), close);

  const emailStep = () => {
    const input = el("input", { type: "email", autocomplete: "email", inputMode: "email", placeholder: "Deine E-Mail-Adresse", className: "login-input" });
    input.setAttribute("aria-label", "E-Mail-Adresse");
    // Mobile keyboard with "@" and ".", no auto-capitalising or auto-correcting of the address.
    for (const [k, v] of Object.entries({ name: "email", autocapitalize: "none", autocorrect: "off", spellcheck: "false", enterkeyhint: "send" })) input.setAttribute(k, v);
    const send = btn("Code senden", "btn-primary", () => void request(input.value, send));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send.click(); });
    const google = btn("Mit Google anmelden", "btn-secondary login-google", () => { dlg.close(); void Online.signIn(); });
    const badge = el("span", { className: "login-google-icon" });
    badge.insertAdjacentHTML("afterbegin", GOOGLE_ICON); // a constant SVG, never user input
    google.prepend(badge);
    dlg.replaceChildren(head,
      el("p", { textContent: "Wir schicken Dir einen Code per E-Mail. Ein Passwort brauchst Du nicht." }),
      input, send, problem,
      el("p", { className: "login-or muted small", textContent: "oder" }), google);
    show("");
    input.focus();
  };

  const codeStep = (email: string) => {
    const input = el("input", { type: "text", autocomplete: "one-time-code", inputMode: "numeric", pattern: "[0-9]*", enterKeyHint: "done", placeholder: "6-stelliger Code", className: "login-input login-code" });
    input.setAttribute("aria-label", "Code aus der E-Mail");
    const done = btn("Anmelden", "btn-primary", async () => {
      const token = cleanCode(input.value);
      if (!token) { show("Bitte gib den 6-stelligen Code aus der E-Mail ein."); return; }
      done.disabled = true;
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      done.disabled = false;
      if (error) { show(loginProblem(error).text); return; }
      dlg.close(); // onAuthStateChange has the session and refreshes the menu
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") done.click(); });
    // Typing or pasting the sixth digit checks the code right away.
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 6); // digits only, also when pasted with spaces
      if (cleanCode(input.value) && !done.disabled) done.click();
    });
    const again = btn("Neuen Code anfordern", "btn-secondary", () => void request(email, again, true));
    const other = btn("Andere E-Mail-Adresse", "btn-secondary", emailStep);
    dlg.replaceChildren(head,
      el("p", {}, "Wir haben einen Code an ", el("b", { className: "login-email", textContent: email }), " geschickt. Gib ihn hier ein; schau auch im Spam-Ordner nach."),
      input, done, problem, again, other);
    show("");
    input.focus();
  };

  const request = async (raw: string, button: HTMLButtonElement, resend = false) => {
    const email = cleanEmail(raw);
    if (!email) { show("Bitte gib eine gültige E-Mail-Adresse ein."); return; }
    button.disabled = true;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    button.disabled = false;
    if (error) { show(loginProblem(error).text); return; }
    if (!resend) track("login", { provider: "email" });
    codeStep(email);
    if (resend) show("Ein neuer Code ist unterwegs.");
  };

  emailStep();
  document.body.append(dlg);
  dlg.showModal();
}

/** A small message dialog with one button, in place of alert(); resolves when it is closed (button, Escape or click outside). */
function notice(o: { title: string; text: string; ok?: string }): Promise<void> {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "team-dialog confirm-dialog";
    dlg.setAttribute("aria-labelledby", "notice-h");
    const h = Object.assign(document.createElement("h2"), { id: "notice-h", textContent: o.title });
    const p = Object.assign(document.createElement("p"), { textContent: o.text });
    const row = document.createElement("div");
    row.className = "btn-row";
    const ok = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-primary", textContent: o.ok ?? "OK" });
    ok.addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(); });
    row.append(ok);
    dlg.append(h, p, row);
    document.body.append(dlg);
    dlg.showModal();
    ok.focus();
  });
}

/** A small confirmation dialog; resolves true only on the confirm button, false on cancel, Escape or a click outside. */
function ask(o: { title: string; text: string; /** Bullet points shown under the text */ items?: string[]; cancel: string; ok: string; /** A constant SVG shown before the confirm label */ okIcon?: string; danger?: boolean }): Promise<boolean> {
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
    if (o.okIcon) {
      // A white badge keeps the multicolour logo readable on the blue button.
      const badge = document.createElement("span");
      badge.insertAdjacentHTML("afterbegin", o.okIcon); // a constant SVG, never user input
      Object.assign(badge.style, { display: "inline-flex", background: "#fff", borderRadius: "50%", padding: "3px", marginRight: "8px", verticalAlign: "middle" });
      const svg = badge.querySelector("svg");
      if (svg) { svg.style.width = "16px"; svg.style.height = "16px"; }
      ok.prepend(badge);
    }
    cancel.addEventListener("click", () => dlg.close("cancel"));
    ok.addEventListener("click", () => dlg.close("ok"));
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close("cancel"); });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(dlg.returnValue === "ok"); });
    row.append(cancel, ok);
    const list = o.items?.length ? document.createElement("ul") : null;
    if (list) for (const t of o.items!) list.append(Object.assign(document.createElement("li"), { textContent: t }));
    dlg.append(h, p, ...(list ? [list] : []), row);
    document.body.append(dlg);
    dlg.showModal();
    cancel.focus();
  });
}

/** A dialog that can only be left with one of its buttons (no Escape, no click outside); resolves with the button's value. */
function decideDialog(o: { title: string; text: string; body?: HTMLElement; /** Title in the header row, like the page's own player list */ headed?: boolean; buttons: { label: string; value: string; primary?: boolean }[] }): Promise<string> {
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
    const head = o.headed ? Object.assign(document.createElement("div"), { className: "dialog-head" }) : null;
    head?.append(h);
    dlg.append(head ?? h, p, ...(o.body ? [o.body] : []), row);
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

/** Small per-device note next to the session (never sent anywhere). */
const ATTEMPT_NOTE = `${STORAGE_KEY}-attempt`;
const readNote = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const writeNote = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* optional */ }
};
/** The last pick this device sent as a claim ("ok:<person>" or "taken:<person>"). */
function lastAttempt(): { person: number; ok: boolean } | null {
  const m = /^(ok|taken):(\d+)$/.exec(readNote(ATTEMPT_NOTE) ?? "");
  return m ? { person: Number(m[2]), ok: m[1] === "ok" } : null;
}

/** The roster the build embeds in team pages: the players one can be matched with. */
function pageRoster(): { person: number; name: string; href: string | null }[] {
  try { return JSON.parse(document.getElementById("me-roster")?.textContent ?? "[]"); } catch { return []; }
}

/** The account's own claim, the pending ones for approvers, and the device's pick brought in line with them. */
async function loadClaims(s: Session, run: number): Promise<void> {
  const own = await supabase.from("player_claims").select("*").eq("user_id", s.user.id);
  if (run !== applied) return;
  // A failed read (offline) keeps the saved claim instead of clearing it.
  if (own.error) return;
  state.claim = ((own.data ?? []) as ClaimRow[])[0] ?? null;
  await loadPending(run);
  // The link in the "new sign-in" push (#49) opens the approvals.
  if (location.hash === "#anfragen" && state.pending.length) {
    history.replaceState(null, "", location.pathname + location.search);
    openApprovals();
  }
  const me = meApi();
  if (!me) return;
  const server = state.claim;
  const local = me.get();
  const canApprove = state.permissions.has("player.link");
  const result = reconcile(local, server && { person: server.person, name: server.player_name, status: server.status }, canApprove, lastAttempt());
  if (result.action === "adopt") me.set(result.pick);
  else if (result.action === "upload") await saveClaim(result.pick, result.status);
  else if (result.action === "rejected") {
    writeNote(ATTEMPT_NOTE, null);
    me.set(null);
    await notice({ title: "Anfrage nicht bestätigt", text: `Deine Anfrage für ${shownName(result.pick.name)} wurde nicht bestätigt. Die Auswahl wurde zurückgesetzt.` });
  } else if (!local && !server && !state.notAPlayer) await confirmPlayer(me, s, canApprove, run);
}

const NOT_A_PLAYER = "none";

/** "Nicht aktiver Spieler": remembered on the account, which drops its claim (and the player role). */
async function setNotAPlayer(me: MeApi): Promise<void> {
  const { error } = await supabase.rpc("set_not_a_player", { flag: true });
  if (error) { console.error("set_not_a_player failed", error); await notice({ title: "Nicht gespeichert", text: "Das konnte nicht gespeichert werden. Bitte versuche es später noch einmal." }); return; }
  state.notAPlayer = true;
  state.claim = null;
  writeNote(ATTEMPT_NOTE, null);
  me.set(null);
  track("claim", { action: "not-a-player" });
  commit();
}

/**
 * Sign-in without a chosen player: the account has to say who it is. The Google name is looked up in
 * the team's roster and preselected; the user confirms it or picks another. The pick becomes a normal
 * claim, so it still needs approval. The dialog can only be left by choosing or by signing out.
 */
let playerDialogOpen = false;
async function confirmPlayer(me: MeApi, s: Session, canApprove: boolean, run: number, replacing = false): Promise<void> {
  // Every auth event (also the one supabase-js fires when the tab regains focus, e.g. while a select's
  // list is open) runs loadClaims again; a second dialog would close the first one's open list.
  if (playerDialogOpen) return;
  playerDialogOpen = true;
  try { await askPlayer(me, s, canApprove, run, replacing); } finally { playerDialogOpen = false; }
}

async function askPlayer(me: MeApi, s: Session, canApprove: boolean, run: number, replacing: boolean): Promise<void> {
  const roster = pageRoster();
  if (!roster.length) return;
  // The page's own list of players would sit behind this dialog; this one replaces it.
  (document.getElementById("me-dialog") as HTMLDialogElement | null)?.close();
  const meta = s.user.user_metadata as Record<string, unknown>;
  const hit = replacing ? null : matchPlayer(String(meta.full_name ?? meta.name ?? ""), roster);
  const current = me.get()?.person;
  // A list of buttons like the lineup's picker (a native select with this many names closes right after the first click in Chromium).
  const body = document.createElement("div");
  const ul = Object.assign(document.createElement("ul"), { className: "team-list" });
  body.append(ul);
  const option = (value: string, label: string, isHit = false) => {
    const b = Object.assign(document.createElement("button"), { type: "button", className: "me-option" });
    b.append(Object.assign(document.createElement("span"), { className: "team-label", textContent: label }));
    if (isHit) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => (b.closest("dialog") as HTMLDialogElement).close(`pick:${value}`));
    const li = document.createElement("li");
    li.append(b);
    ul.append(li);
  };
  // For members who don't play; also the way out of an existing pick ("Ich bin nicht …" asks for a new player).
  option(NOT_A_PLAYER, "Nicht aktiver Spieler");
  for (const r of [...roster].sort((a, b) => shownName(a.name).localeCompare(shownName(b.name), "de"))) {
    if (replacing && r.person === current) continue;
    option(String(r.person), shownName(r.name), hit?.person === r.person);
  }
  let chosen: (typeof roster)[number] | undefined;
  while (!chosen) {
    // Signed in the dialog is left by choosing a player, "Nicht aktiver Spieler", or by signing out (when replacing: by cancelling, which changes nothing).
    const answer = await decideDialog({
      title: replacing ? "Neuen Spieler wählen" : "Wer bist Du?",
      text: replacing ? "Wähle den Spieler, der Du stattdessen bist, oder „Nicht aktiver Spieler“. Erst damit wird die Auswahl geändert." : hit ? "Ist das Dein Name in der Mannschaft? Tippe auf Deinen Spieler." : "Tippe auf Deinen Spieler aus der Mannschaft.",
      body,
      headed: true,
      buttons: [{ label: replacing ? "Abbrechen" : "Abmelden", value: "leave" }],
    });
    if (answer === "leave") {
      if (!replacing) await Online.signOut();
      return;
    }
    if (answer === `pick:${NOT_A_PLAYER}`) {
      await setNotAPlayer(me);
      return;
    }
    chosen = roster.find((r) => `pick:${r.person}` === answer);
  }
  // Not `run !== applied`: a later auth event (same user) must not throw the answer away.
  if (state.session?.user.id !== s.user.id) return;
  const pick = { person: chosen.person, name: chosen.name };
  me.set(pick);
  track("claim", { action: replacing ? "pick" : hit && hit.person === chosen.person ? "automatch" : "pick" });
  await saveClaim(pick, canApprove ? "approved" : "pending");
}

// Signed in, "Ich bin nicht …" and toggling the player off can't leave the device without a player (ME script):
// they ask for the new one right away, and nothing changes until one is confirmed.
(window as unknown as { otClearMe: () => boolean }).otClearMe = () => {
  const me = meApi();
  if (!state.session || !me || !me.get() || !pageRoster().length) return false;
  void confirmPlayer(me, state.session, state.permissions.has("player.link"), applied, true);
  return true;
};

async function loadPending(run: number): Promise<void> {
  if (!state.permissions.has("player.link")) { state.pending = []; return; }
  const { data, error } = await supabase.from("player_claims").select("*").eq("status", "pending").order("created_at");
  if (error) return;
  const rows = (data ?? []) as ClaimRow[];
  const ids = [...new Set(rows.map((r) => r.user_id))];
  const [names, mails] = ids.length
    ? await Promise.all([supabase.from("profiles").select("id, display_name").in("id", ids), supabase.rpc("pending_claim_emails")])
    : [null, null];
  if (run !== applied) return;
  const byId = new Map(((names?.data ?? []) as { id: string; display_name: string | null }[]).map((n) => [n.id, n.display_name]));
  const emailById = new Map(((mails?.data ?? []) as { user_id: string; email: string | null }[]).map((m) => [m.user_id, m.email ?? ""]));
  state.pending = rows.filter((r) => r.user_id !== state.session?.user.id).map((r) => ({ ...r, who: byId.get(r.user_id) ?? "Unbekannt", email: emailById.get(r.user_id) ?? "" }));
}

/** Replaces the account's claim. A taken player keeps the device pick only. */
async function saveClaim(pick: Pick | null, status: "pending" | "approved" = "pending"): Promise<void> {
  if (!state.session) return;
  const uid = state.session.user.id;
  const del = await supabase.from("player_claims").delete().eq("user_id", uid);
  if (del.error) console.error("player_claims delete failed", del.error);
  state.claim = null;
  if (pick) {
    const { data, error } = await supabase.from("player_claims")
      .insert({ user_id: uid, person: pick.person, player_name: pick.name, status })
      .select("*").single();
    if (error) {
      if (error.code === "23505") {
        writeNote(ATTEMPT_NOTE, `taken:${pick.person}`);
        await notice({ title: "Spieler schon verknüpft", text: "Dieser Spieler ist schon mit einem anderen Konto verknüpft. Die Auswahl gilt nur auf diesem Gerät." });
      } else {
        // e.g. the table is missing (migration not applied) or a policy refused the row; the pick stays on this device.
        console.error("player_claims insert failed", error);
      }
    } else {
      state.claim = data as ClaimRow;
      state.notAPlayer = false; // the database resets the flag with a new claim
      writeNote(ATTEMPT_NOTE, `ok:${pick.person}`);
      // Tell the approvers about a new account (#49); the function notifies once per account and skips approvers.
      if (status === "pending") void supabase.functions.invoke("notify-new-user", { body: { team: document.getElementById("me-roster")?.dataset.team ?? "" } }).catch(() => {});
    }
  } else {
    writeNote(ATTEMPT_NOTE, null);
  }
  track("claim", { action: pick ? status : "clear" });
  commit();
}

// The ME script reports every pick made on this device; signed in, it becomes the account's claim.
(window as unknown as { otMeChanged: (pick: Pick | null) => void }).otMeChanged = async (pick) => {
  const me = meApi();
  if (!state.session) { renderAccount(); return; }
  if (!me) return;
  const current = state.claim;
  if (current && current.status === "approved" && pick?.person !== current.person && !state.permissions.has("player.link")) {
    if (!(await ask({ title: "Spieler ersetzen?", text: "Dein bestätigter Spieler wird ersetzt und muss neu bestätigt werden.", cancel: "Abbrechen", ok: "Fortfahren" }))) {
      me.set({ person: current.person, name: current.player_name });
      return;
    }
  }
  void saveClaim(pick, state.permissions.has("player.link") ? "approved" : "pending").catch(() => {});
};

/** Approvers: a dialog with the waiting claims. Names come from the roster of this page's team when the person is on it. */
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
  const rosterName = (c: ClaimRow) => pageRoster().find((r) => r.person === c.person)?.name ?? c.player_name;
  const d = dlg;
  const render = () => {
    const competing = competingClaims(state.pending);
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
    if (!state.pending.length) {
      const p = document.createElement("p");
      p.textContent = "Keine offenen Anfragen.";
      d.append(p);
    }
    for (const c of state.pending) {
      const row = document.createElement("div");
      row.className = "claim-row";
      const text = document.createElement("p");
      text.append(Object.assign(document.createElement("b"), { textContent: c.who }), ` möchte ${rosterName(c)} sein.`);
      if (c.email) text.append(document.createElement("br"), Object.assign(document.createElement("span"), { className: "small muted", textContent: c.email }));
      const others = competing.get(c.id);
      if (others) text.append(document.createElement("br"), Object.assign(document.createElement("span"), { className: "small", textContent: `Noch ${others === 1 ? "eine weitere Anfrage" : `${others} weitere Anfragen`} für diesen Spieler: mit Bestätigen ${others === 1 ? "wird sie" : "werden sie"} abgelehnt.` }));
      const buttons = document.createElement("div");
      buttons.className = "btn-row";
      const decide = (approve: boolean) => async () => {
        const { error } = approve
          ? await supabase.from("player_claims").update({ status: "approved" }).eq("id", c.id)
          : await supabase.from("player_claims").delete().eq("id", c.id);
        if (error) { await notice({ title: "Das hat nicht geklappt", text: "Bitte versuche es später noch einmal." }); return; }
        track("claim-decision", { decision: approve ? "approve" : "reject" });
        state.pending = state.pending.filter((x) => x.id !== c.id);
        commit();
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

/** Admin dialog (permission role.manage): all accounts with their roles; grant or revoke team lead and admin. The database enforces it again. */
async function openRoles(): Promise<void> {
  let dlg = document.getElementById("roles-dialog") as HTMLDialogElement | null;
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "roles-dialog";
    dlg.className = "team-dialog";
    dlg.setAttribute("aria-labelledby", "roles-h");
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg!.close(); });
    document.body.append(dlg);
  }
  const d = dlg;
  const selfId = state.session?.user.id ?? "";
  let users: RoleUser[] = [];
  let failed = false;
  let loading = true;
  const render = () => {
    d.textContent = "";
    const head = document.createElement("div");
    head.className = "dialog-head";
    const h = Object.assign(document.createElement("h2"), { id: "roles-h", textContent: "Rollen verwalten" });
    const close = Object.assign(document.createElement("button"), { type: "button", className: "dialog-close", textContent: "×" });
    close.setAttribute("aria-label", "Schließen");
    close.addEventListener("click", () => d.close());
    head.append(h, close);
    d.append(head);
    if (loading) d.append(Object.assign(document.createElement("p"), { className: "loading", textContent: "Lädt …" }));
    if (failed) d.append(Object.assign(document.createElement("p"), { textContent: "Die Nutzer konnten nicht geladen werden. Bitte versuche es später noch einmal." }));
    const adminCount = users.filter((u) => u.roles.includes("admin")).length;
    for (const u of sortUsers(users)) {
      const row = document.createElement("div");
      row.className = "claim-row user-row";
      const text = document.createElement("p");
      text.className = "user-info";
      text.append(Object.assign(document.createElement("b"), { textContent: userLabel(u) }));
      if (u.email) text.append(document.createElement("br"), Object.assign(document.createElement("span"), { className: "small muted", textContent: u.email }));
      const buttons = document.createElement("div");
      buttons.className = "user-actions";
      for (const role of ASSIGNABLE_ROLES) {
        const has = u.roles.includes(role);
        const b = Object.assign(document.createElement("button"), {
          type: "button",
          className: has ? "btn btn-icon btn-primary" : "btn btn-icon btn-secondary",
          title: ROLE_LABELS[role],
          innerHTML: ROLE_ICONS[role],
        });
        b.setAttribute("aria-label", ROLE_LABELS[role]);
        b.setAttribute("aria-pressed", String(has));
        if (has && !canRevokeRole(selfId, u.user_id, role, adminCount)) b.disabled = true;
        b.addEventListener("click", async () => {
          if (has && role === "admin" && !(await ask({ title: "Administrator entziehen?", text: `${userLabel(u)} verliert die Administratorrechte.`, cancel: "Abbrechen", ok: "Entziehen", danger: true }))) return;
          const { error } = await supabase.rpc("set_user_role", { target: u.user_id, role_name: role, on_: !has });
          if (error) { await notice({ title: "Das hat nicht geklappt", text: "Bitte versuche es später noch einmal." }); return; }
          track("role-change", { role, granted: String(!has) });
          u.roles = has ? u.roles.filter((r) => r !== role) : [...u.roles, role];
          if (u.user_id === selfId) { state.roles = u.roles; commit(); }
          render();
        });
        buttons.append(b);
      }
      const own = u.user_id === selfId;
      const del = Object.assign(document.createElement("button"), { type: "button", className: "btn btn-icon btn-danger", innerHTML: TRASH_ICON });
      // Your own account can't be deleted here (use "Konto löschen" in the menu); the disabled button says why.
      del.title = own ? "Dein eigenes Konto kann hier nicht gelöscht werden. Nutze dafür „Konto löschen“ im Menü." : "Konto löschen";
      del.setAttribute("aria-label", del.title);
      del.disabled = own;
      del.addEventListener("click", async () => {
        if (!(await ask({ title: "Konto löschen?", text: `Das Konto von ${userLabel(u)} und alle zugehörigen Daten werden unwiderruflich gelöscht.`, cancel: "Abbrechen", ok: "Löschen", danger: true }))) return;
        const { error } = await supabase.rpc("admin_delete_user", { target: u.user_id });
        if (error) { await notice({ title: "Das hat nicht geklappt", text: "Bitte versuche es später noch einmal." }); return; }
        track("admin-delete-user");
        users = users.filter((x) => x.user_id !== u.user_id);
        render();
      });
      buttons.append(del);
      row.append(text, buttons);
      d.append(row);
    }
  };
  render();
  d.showModal();
  const [list, players] = await Promise.all([supabase.rpc("list_users_with_roles"), supabase.rpc("list_user_players")]);
  loading = false;
  failed = !!list.error;
  const names = new Map(((players.data ?? []) as { user_id: string; player_name: string }[]).map((p) => [p.user_id, p.player_name]));
  users = Array.isArray(list.data) ? (list.data as RoleUser[]).map((u) => ({ ...u, player_name: names.get(u.user_id) ?? null })) : [];
  render();
}

let applied = 0;
/** Takes over a session change: loads the profile, roles and permissions, shows the account, then tells the listeners. */
function apply(s: Session | null): void {
  const run = ++applied;
  // A token refresh keeps what is known; another user (or none) starts from what was saved for them.
  if (s?.user.id !== state.session?.user.id) {
    state.session = s;
    hydrate(s?.user.id ?? "");
  } else {
    state.session = s;
  }
  const done = () => {
    if (run !== applied) return;
    commit();
    (window as unknown as { otReleaseRefilter?: () => void }).otReleaseRefilter?.();
    listeners.forEach((fn) => fn(state.session));
  };
  if (!s) {
    save();
    return done();
  }
  // Show the account at once; the loads below can take long (or fail) offline.
  done();
  // Not awaited inside the auth callback: supabase-js would deadlock on its own lock.
  const load = async () => {
    const [perms, profile, userRoles] = await Promise.all([
      supabase.rpc("my_permissions"),
      supabase.from("profiles").select("display_name, not_a_player").eq("id", s.user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", s.user.id),
    ]);
    if (run !== applied) return;
    // Only a fully successful load replaces what is shown (and cached); on failure keep the cached values.
    if (!perms.error && !profile.error && !userRoles.error) {
      state.permissions = new Set(Array.isArray(perms.data) ? (perms.data as string[]) : []);
      const prof = profile.data as { display_name: string | null; not_a_player?: boolean } | null;
      state.displayName = prof?.display_name ?? null;
      state.notAPlayer = !!prof?.not_a_player;
      state.roles = Array.isArray(userRoles.data) ? (userRoles.data as { role: string }[]).map((r) => r.role) : [];
    }
    await loadClaims(s, run);
    if (run === applied) syncNow();
    const me = meApi();
    const persons = me ? await Online.verifiedPlayers() : null;
    if (persons && run === applied) markVerified(persons);
  };
  // On failure the footer falls back to the Google name and the user counts as having no permissions.
  void load().catch(() => {}).finally(done);
}

// Fires once with the stored session and again on every sign-in, sign-out and token refresh.
// Until then the session persisted by supabase-js is shown (see storedSession).
const initial = storedSession();
// The account copy is still here but the session is gone: the browser dropped part of the site data.
if (!initial && (() => { try { return localStorage.getItem(SAVED_KEY) !== null; } catch { return false; } })()) {
  document.addEventListener("DOMContentLoaded", () => loggedOutUnexpectedly("session-missing"), { once: true });
}
if (initial) {
  try { otIdentify({ storage: "cloud" }); } catch { /* tracking is optional */ }
  apply(initial);
}
/** The session vanished without the user signing out: tell them and record why, to find the cause. */
function loggedOutUnexpectedly(cause: string): void {
  track("unexpected-logout", { cause, online: String(navigator.onLine) });
  void notice({ title: "Du wurdest abgemeldet", text: "Deine Anmeldung ist abgelaufen oder wurde beendet. Bitte melde Dich erneut an." });
}
supabase.auth.onAuthStateChange((event, s) => {
  state.loading = false;
  if (!s && state.session && !signingOut && event === "SIGNED_OUT") loggedOutUnexpectedly("event");
  // Offline, a failed token refresh must not look like signing out; only an explicit sign-out does.
  if (!s && event !== "SIGNED_OUT" && state.session && !navigator.onLine) return;
  try { otIdentify({ storage: s ? "cloud" : "local" }); } catch { /* tracking is optional */ }
  apply(s);
});
// Signed out: show the local state now, also if no event ever arrives.
if (!initial) setTimeout(() => { if (state.loading) { state.loading = false; renderAccount(); } }, 3000);

// Ask the browser not to evict this site's data (and with it the sign-in) under storage pressure.
// Installed apps are usually granted this at once; tracked once per device when it is not.
void (async () => {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    const granted = await navigator.storage.persist();
    if (!localStorage.getItem(`${STORAGE_KEY}-persist-asked`)) {
      localStorage.setItem(`${STORAGE_KEY}-persist-asked`, "1");
      track("storage-persist", { granted: String(granted) });
    }
  } catch { /* optional */ }
})();
