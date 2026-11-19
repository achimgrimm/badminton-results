/** Text and checks for the push to the team lead when a player cancels after the lineup is published (#57). Pure, tested with the app's tests. */

/** How long a "no" has to stand before the team lead hears of it: players click through yes, maybe, no. */
export const CANCEL_DELAY_MS = 90_000;

/** A readable match name from the game key ("heim-sv-foo" → "Heimspiel gegen sv foo"). */
export function matchLabel(game: string): string {
  const m = /^(heim|auswaerts)-(.+)$/.exec(game);
  if (!m) return game;
  return `${m[1] === "heim" ? "Heimspiel" : "Auswärtsspiel"} gegen ${m[2].replace(/-/g, " ")}`;
}

/** Whether the person has a place in the published lineup. */
export function inLineup(lineup: Record<string, (string | null)[]> | null, person: number): boolean {
  return Object.values(lineup ?? {}).some((ps) => ps.some((p) => p != null && Number(p) === person));
}

export function cancellationText(player: string, game: string): { title: string; body: string } {
  return { title: `Absage: ${player}`.slice(0, 100), body: `${player} hat für das ${matchLabel(game)} abgesagt. Die Aufstellung ist bereits veröffentlicht.` };
}
