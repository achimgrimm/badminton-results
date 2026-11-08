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

let session: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

export const Online = {
  get session() { return session; },
  signIn: async () => {
    track("login", { provider: "google" });
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Back to this very page (also works under /stage/<name>/).
      options: { redirectTo: location.origin + location.pathname },
    });
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

supabase.auth.onAuthStateChange((_event, s) => {
  session = s;
  renderAccount();
  listeners.forEach((fn) => fn(session));
});
supabase.auth.getSession().then(({ data }) => {
  session = data.session;
  renderAccount();
  listeners.forEach((fn) => fn(session));
});
