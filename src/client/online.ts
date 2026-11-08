/**
 * Online features (Supabase): Google sign-in in the footer. Bundled to online.js by the build and
 * loaded only when ONLINE is set. Everything else in the app works without it. The globals are
 * replaced at build time (see buildOnlineBundle in src/build.ts).
 */
import { createClient, type Session } from "@supabase/supabase-js";

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
const listeners = new Set<(s: Session | null) => void>();

export const Online = {
  get session() { return session; },
  get permissions() { return permissions; },
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
  const meta = session.user.user_metadata as Record<string, unknown>;
  const name = String(meta.full_name ?? meta.name ?? session.user.email ?? "Konto");
  el.append(`Angemeldet als ${name} · `, link("Abmelden", () => void Online.signOut()), " · ", link("Konto löschen", () => {
    if (!confirm("Konto und alle gespeicherten Daten endgültig löschen?")) return;
    Online.deleteAccount().catch(() => alert("Das Konto konnte nicht gelöscht werden. Bitte versuche es später noch einmal."));
  }));
}

let applied = 0;
/** Takes over a session change: shows the account, loads its permissions, then tells the listeners. */
function apply(s: Session | null): void {
  const run = ++applied;
  session = s;
  permissions = new Set();
  renderAccount();
  const done = () => {
    if (run === applied) listeners.forEach((fn) => fn(session));
  };
  if (!s) return done();
  // Not awaited inside the auth callback: supabase-js would deadlock on its own lock.
  void Promise.resolve(supabase.rpc("my_permissions"))
    .then(({ data }) => {
      if (run === applied) permissions = new Set(Array.isArray(data) ? (data as string[]) : []);
    })
    .catch(() => { /* no permissions known: the app treats the user as having none */ })
    .finally(done);
}

// Fires once with the stored session and again on every sign-in, sign-out and token refresh.
supabase.auth.onAuthStateChange((_event, s) => apply(s));
