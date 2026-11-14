/** Texts and decision for the push to approvers about a new sign-in (#49). Pure, so it is tested with the app's tests. */

/** Whether the new account's pick is worth a push: not for approvers, not without a pending pick, not twice. */
export function shouldNotify(o: { alreadyNotified: boolean; callerCanApprove: boolean; hasPendingClaim: boolean }): boolean {
  return o.hasPendingClaim && !o.callerCanApprove && !o.alreadyNotified;
}

export function signinText(who: string | null, player: string): { title: string; body: string } {
  const name = who?.trim() || "Jemand";
  return { title: "Neue Anmeldung", body: `${name} möchte ${player} sein. Tippen zum Bestätigen.` };
}

/** The team's player page, which opens the approval dialog of the app; null for anything but a plain team slug. */
export function signinPath(team: unknown): string | null {
  return typeof team === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(team) ? `${team}/spieler.html#anfragen` : null;
}
