/**
 * Keeps the device's "Ich spiele" answers and the account's (table game_answers) in line. Signed in,
 * the account is the source of truth and localStorage its offline copy: changes made offline are
 * sent when the connection is back, and the newest change per game wins (see src/sync.ts). Signed
 * out, none of this runs. The first sign-in of an account on a device decides once: see firstSync.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { firstSync, fromRemote, isState, mergeRemote, pendingChanges, stampMissing, type Answers, type Change, type Local, type Scoped, type Stamps } from "../sync.ts";

interface Scope { team: string; season: string }
interface Row { team_slug: string; season: string; game_key: string; state: string | null; updated_at: string }

export interface SyncDeps {
  supabase: SupabaseClient;
  /** The stage-aware prefix of this build's localStorage names (STORAGE_KEY without "auth"). */
  prefix: string;
  /** localStorage name of the auth session; the sync's notes live beneath it, so signing out cleans them up too. */
  authKey: string;
  /** Asks which side to keep when the device and the account differ. */
  choose: () => Promise<"cloud" | "local">;
}

const scopeId = (s: Scope) => `${s.team}|${s.season}`;
const read = (key: string): unknown => { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional */ } };

export function createSync(deps: SyncDeps) {
  const { supabase, prefix, authKey } = deps;
  const answersKey = (s: Scope) => `${prefix}playing-${s.team}-${s.season}`;
  const stampsKey = (s: Scope) => `${prefix}answers-at-${s.team}-${s.season}`;
  const syncedKey = (uid: string, s: Scope) => `${authKey}-synced-${uid}-${s.team}-${s.season}`;
  const decidedKey = (uid: string) => `${authKey}-sync-${uid}`;

  /** The teams and seasons with answers on this device. */
  function localScopes(): Scope[] {
    const out: Scope[] = [];
    const head = `${prefix}playing-`;
    for (const key of Object.keys(localStorage)) {
      const m = key.startsWith(head) ? /^(.+)-(\d{4}-\d{2})$/.exec(key.slice(head.length)) : null;
      if (m) out.push({ team: m[1], season: m[2] });
    }
    return out;
  }

  function readLocal(s: Scope): Local {
    const raw = read(answersKey(s));
    const answers: Answers = {};
    if (Array.isArray(raw)) raw.forEach((k) => { if (typeof k === "string") answers[k] = "yes"; }); // the old list format
    else if (raw && typeof raw === "object") for (const [k, v] of Object.entries(raw)) if (isState(v)) answers[k] = v;
    const stamps = read(stampsKey(s));
    const at: Stamps = {};
    if (stamps && typeof stamps === "object") for (const [k, v] of Object.entries(stamps)) if (typeof v === "number") at[k] = v;
    return { answers, at };
  }

  function writeLocal(s: Scope, l: Local) {
    write(answersKey(s), l.answers);
    write(stampsKey(s), l.at);
  }

  const readSynced = (uid: string, s: Scope): Stamps => (read(syncedKey(uid, s)) as Stamps | null) ?? {};

  const toChange = (r: Row): Change => ({ key: r.game_key, state: isState(r.state) ? r.state : null, at: Date.parse(r.updated_at) });

  /** The account's rows grouped by team and season; null when they can't be read (offline, table missing). */
  async function fetchRows(uid: string): Promise<{ rows: Row[]; scopes: Map<string, { scope: Scope; changes: Change[] }> } | null> {
    const { data, error } = await supabase.from("game_answers").select("team_slug, season, game_key, state, updated_at").eq("user_id", uid);
    if (error) return null;
    const rows = (data ?? []) as Row[];
    const scopes = new Map<string, { scope: Scope; changes: Change[] }>();
    for (const r of rows) {
      const scope = { team: r.team_slug, season: r.season };
      const entry = scopes.get(scopeId(scope)) ?? { scope, changes: [] };
      entry.changes.push(toChange(r));
      scopes.set(scopeId(scope), entry);
    }
    return { rows, scopes };
  }

  /** Sends every change of the device that the account hasn't got; marks the sent ones as synced. */
  async function push(uid: string, scopes: Scope[]): Promise<boolean> {
    const batch: { scope: Scope; change: Change }[] = [];
    for (const scope of scopes) for (const change of pendingChanges(readLocal(scope), readSynced(uid, scope))) batch.push({ scope, change });
    if (!batch.length) return true;
    const { error } = await supabase.from("game_answers").upsert(
      batch.map(({ scope, change }) => ({
        user_id: uid, team_slug: scope.team, season: scope.season, game_key: change.key,
        state: change.state, updated_at: new Date(change.at).toISOString(),
      })),
      { onConflict: "user_id,team_slug,season,game_key" },
    );
    if (error) return false;
    for (const scope of scopes) {
      const synced = readSynced(uid, scope);
      for (const { scope: s, change } of batch) if (scopeId(s) === scopeId(scope)) synced[change.key] = change.at;
      write(syncedKey(uid, scope), synced);
    }
    return true;
  }

  const scoped = (s: Scope, a: Answers): Scoped[] => Object.entries(a).map(([key, state]) => ({ team: s.team, season: s.season, key, state }));

  /** First sign-in of this account on this device: take the device's answers, the account's, or ask. Returns true when done. */
  async function decide(uid: string, fetched: NonNullable<Awaited<ReturnType<typeof fetchRows>>>): Promise<boolean> {
    const local = localScopes();
    const localAnswers = local.flatMap((s) => scoped(s, readLocal(s).answers));
    const remoteAnswers = [...fetched.scopes.values()].flatMap(({ scope, changes }) => scoped(scope, fromRemote(changes).answers));
    let what = firstSync(localAnswers, remoteAnswers, fetched.rows.length);
    if (what === "ask") what = (await deps.choose()) === "cloud" ? "cloud" : "upload";
    const all = new Map<string, Scope>([...local, ...[...fetched.scopes.values()].map((e) => e.scope)].map((s) => [scopeId(s), s]));
    if (what === "cloud") {
      for (const s of all.values()) {
        const changes = fetched.scopes.get(scopeId(s))?.changes ?? [];
        writeLocal(s, fromRemote(changes));
        write(syncedKey(uid, s), Object.fromEntries(changes.map((c) => [c.key, c.at])));
      }
    } else {
      // "Local" replaces what the account has: its rows go first, then everything on the device is sent.
      if (fetched.rows.length) {
        const del = await supabase.from("game_answers").delete().eq("user_id", uid);
        if (del.error) return false;
      }
      const now = Date.now();
      for (const s of all.values()) {
        writeLocal(s, stampMissing(readLocal(s), now));
        write(syncedKey(uid, s), {});
      }
      if (!(await push(uid, [...all.values()]))) return false;
    }
    write(decidedKey(uid), 1);
    return true;
  }

  let running: Promise<void> | null = null;
  let again = false;

  /** Pulls the account's changes into the device, then sends the device's. Never throws; failing quietly is fine, the next run retries. */
  function sync(uid: string | null): Promise<void> {
    if (!uid) return Promise.resolve();
    if (running) { again = true; return running; }
    running = (async () => {
      do {
        again = false;
        const fetched = await fetchRows(uid);
        if (!fetched) break;
        if (!read(decidedKey(uid))) {
          if (!(await decide(uid, fetched))) break;
          document.dispatchEvent(new Event("ot-answers-synced"));
          (window as unknown as { otPlayingRender?: () => void }).otPlayingRender?.();
          continue;
        }
        let changed = false;
        const all = new Map<string, Scope>([...localScopes(), ...[...fetched.scopes.values()].map((e) => e.scope)].map((s) => [scopeId(s), s]));
        for (const s of all.values()) {
          const changes = fetched.scopes.get(scopeId(s))?.changes ?? [];
          const merged = mergeRemote(readLocal(s), changes);
          if (merged.changed) { writeLocal(s, merged.local); changed = true; }
          // What the account has is synced; the device's newer changes stay pending.
          const synced = readSynced(uid, s);
          for (const c of changes) synced[c.key] = Math.max(synced[c.key] ?? 0, c.at);
          write(syncedKey(uid, s), synced);
        }
        if (changed) (window as unknown as { otPlayingRender?: () => void }).otPlayingRender?.();
        await push(uid, [...all.values()]);
      } while (again);
    })().catch(() => { /* offline: retried on the next trigger */ }).finally(() => { running = null; });
    return running;
  }

  return { sync };
}
