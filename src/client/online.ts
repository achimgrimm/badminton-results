/**
 * Online features (Supabase): Google sign-in in the footer. Bundled to online.js by the build and
 * loaded only when ONLINE is set. Everything else in the app works without it. The globals are
 * replaced at build time (see buildOnlineBundle in src/build.ts).
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { cleanDisplayName, MAX_NAME_LENGTH, roleLabel } from "../roles.ts";

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
const listeners = new Set<(s: Session | null) => void>();

export const Online = {
  get session() { return session; },
  get permissions() { return permissions; },
  get displayName() { return displayName; },
  get roles() { return roles; },
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
    await supabase.auth.signOut();
  },
  /** Saves the user's own display name (row-level security only allows their own profile). */
  setDisplayName: async (input: string) => {
    const name = cleanDisplayName(input);
    if (!name || !session) throw new Error("invalid name");
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", session.user.id);
    if (error) throw error;
    displayName = name;
    track("name");
    renderAccount();
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

/** The footer's account line, rendered by the layout as an empty #account element. */
function renderAccount(): void {
  const el = document.getElementById("account");
  if (!el) return;
  el.textContent = "";
  const link = (text: string, onClick: () => void) => {
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = text;
    a.addEventListener("click", (e) => { e.preventDefault(); onClick(); });
    return a;
  };
  if (!session) {
    el.append(link("Mit Google anmelden", () => void Online.signIn()));
    return;
  }
  // The name comes from the database; the Google name only fills in until it is loaded or if it is missing.
  const meta = session.user.user_metadata as Record<string, unknown>;
  const name = displayName ?? String(meta.full_name ?? meta.name ?? session.user.email ?? "Konto");
  const role = roleLabel(roles);
  el.append(`Angemeldet als ${name}${role ? ` (${role})` : ""} · `,
    link("Name ändern", () => {
      const input = prompt(`Dein Name in der App (höchstens ${MAX_NAME_LENGTH} Zeichen):`, name);
      if (input === null) return;
      if (!cleanDisplayName(input)) { alert(`Bitte gib einen Namen mit 1 bis ${MAX_NAME_LENGTH} Zeichen ein.`); return; }
      Online.setDisplayName(input).catch(() => alert("Der Name konnte nicht gespeichert werden. Bitte versuche es später noch einmal."));
    }),
    " · ", link("Abmelden", () => void Online.signOut()), " · ", link("Konto löschen", () => {
      if (!confirm("Konto und alle gespeicherten Daten endgültig löschen?")) return;
      Online.deleteAccount().catch(() => alert("Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal."));
    }));
}

let applied = 0;
/** Takes over a session change: loads the profile, roles and permissions, shows the account, then tells the listeners. */
function apply(s: Session | null): void {
  const run = ++applied;
  session = s;
  permissions = new Set();
  displayName = null;
  roles = [];
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
  };
  // On failure the footer falls back to the Google name and the user counts as having no permissions.
  void load().catch(() => {}).finally(done);
}

// Fires once with the stored session and again on every sign-in, sign-out and token refresh.
supabase.auth.onAuthStateChange((_event, s) => apply(s));
