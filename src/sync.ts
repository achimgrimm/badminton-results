/**
 * Pure logic of the answer sync ("Ich spiele", table game_answers; see supabase/migrations). The
 * device keeps its answers in localStorage per team and season ({ gameKey: state }) plus the time of
 * each last change ({ gameKey: ms }); a cleared answer has a time but no state (a tombstone). The
 * newest change per game wins, on the device and on the server alike. The browser side is
 * src/client/sync.ts.
 */

export type State = "yes" | "maybe" | "no";
export const isState = (v: unknown): v is State => v === "yes" || v === "maybe" || v === "no";

export type Answers = Record<string, State>;
export type Stamps = Record<string, number>;
/** One team's and season's answers on the device. */
export interface Local { answers: Answers; at: Stamps }
/** A change of one game, as sent to and read from the server (state null = cleared). */
export interface Change { key: string; state: State | null; at: number }

/** The device's copy with the server's changes applied: per game the newer one wins, a tie keeps the device's. */
export function mergeRemote(local: Local, remote: Change[]): { local: Local; changed: boolean } {
  const answers = { ...local.answers };
  const at = { ...local.at };
  let changed = false;
  for (const r of remote) {
    if (r.at <= (at[r.key] ?? 0)) continue;
    at[r.key] = r.at;
    if (r.state) answers[r.key] = r.state; else delete answers[r.key];
    changed = true;
  }
  return { local: { answers, at }, changed };
}

/** The device's changes the server hasn't got yet: stamped later than what was last sent (synced). */
export function pendingChanges(local: Local, synced: Stamps): Change[] {
  return Object.keys(local.at)
    .filter((key) => local.at[key] > (synced[key] ?? 0))
    .map((key) => ({ key, state: local.answers[key] ?? null, at: local.at[key] }));
}

/** Answers from before the sync have no time yet; they get `now`, so the first upload counts as their change. */
export function stampMissing(local: Local, now: number): Local {
  const at = { ...local.at };
  for (const key of Object.keys(local.answers)) at[key] ??= now;
  return { answers: local.answers, at };
}

/** A local copy replaced by the server's changes (the user chose "Cloud"). */
export function fromRemote(remote: Change[]): Local {
  return mergeRemote({ answers: {}, at: {} }, remote).local;
}

/** Flat view over all teams and seasons, to compare the device with the account. */
export interface Scoped { team: string; season: string; key: string; state: State }
const flat = (list: Scoped[]) => new Map(list.map((a) => [`${a.team}|${a.season}|${a.key}`, a.state]));

/**
 * What to do on the first sign-in of an account on this device. A new account takes the device's
 * answers; an existing one takes its own when the device has nothing or the same; otherwise the user chooses.
 */
export function firstSync(local: Scoped[], remote: Scoped[], remoteRows: number): "upload" | "cloud" | "ask" {
  if (remoteRows === 0) return "upload";
  const l = flat(local), r = flat(remote);
  if (l.size === 0) return "cloud";
  if (l.size === r.size && [...l].every(([k, v]) => r.get(k) === v)) return "cloud";
  return "ask";
}
