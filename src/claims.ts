/** The chosen player of one team and season ("Wer bist Du?"). */
export interface Pick {
  person: number;
  name: string;
}

export interface ServerClaim extends Pick {
  status: "pending" | "approved";
}

export type Reconciled =
  | { action: "none" }
  /** The claim sent earlier is gone from the server: it was rejected, so the device's pick is dropped. */
  | { action: "rejected"; pick: Pick }
  /** Take this pick over on the device. */
  | { action: "adopt"; pick: Pick }
  /** Send the device's pick to the server as a claim (approved straight away for approvers). */
  | { action: "upload"; pick: Pick; status: "pending" | "approved" };

/**
 * Brings the device's pick and the account's claim together after sign-in. The approved claim is the
 * account's identity and wins; a pending one only fills an empty device; otherwise what the user
 * picked on this device is sent as the new claim, unless it was sent before and has vanished since
 * (rejected), or could not be sent because the player belongs to another account (stays on the device).
 */
export function reconcile(
  local: Pick | null,
  server: ServerClaim | null,
  canApprove: boolean,
  /** The last pick this device sent as a claim, and whether it was accepted (false: the player was taken). */
  attempted: { person: number; ok: boolean } | null = null,
): Reconciled {
  if (server?.status === "approved") {
    return local?.person === server.person ? { action: "none" } : { action: "adopt", pick: { person: server.person, name: server.name } };
  }
  if (server) {
    if (!local) return { action: "adopt", pick: { person: server.person, name: server.name } };
    if (local.person === server.person) return canApprove ? { action: "upload", pick: local, status: "approved" } : { action: "none" };
  }
  if (!local) return { action: "none" };
  if (attempted && attempted.person === local.person) return attempted.ok ? { action: "rejected", pick: local } : { action: "none" };
  return { action: "upload", pick: local, status: canApprove ? "approved" : "pending" };
}

/** The pending claims that compete for the same player (same team, season and person), by claim id: the approver sees that approving one rejects the others. */
export function competingClaims<T extends { id: string; team_slug: string; season: string; person: number }>(pending: T[]): Map<string, number> {
  const key = (c: T) => `${c.team_slug}|${c.season}|${c.person}`;
  const count = new Map<string, number>();
  for (const c of pending) count.set(key(c), (count.get(key(c)) ?? 0) + 1);
  return new Map(pending.flatMap((c) => (count.get(key(c))! > 1 ? [[c.id, count.get(key(c))! - 1] as [string, number]] : [])));
}
