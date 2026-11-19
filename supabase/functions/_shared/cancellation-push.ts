/** Text and checks for the push to the team lead when a player cancels after the lineup is published (#57). Pure, tested with the app's tests. */

/** How long a "no" has to stand before the team lead hears of it: players click through yes, maybe, no. */
export const CANCEL_DELAY_MS = 90_000;

/** "Böse, Frank" -> "Frank Böse", as the app shows names (same as displayName in src/names.ts; the function can't import from src). */
export function displayName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

/**
 * A readable match name. The app's own name ("SV Foo – SV Bar", saved with the published lineup) is used as it is;
 * lineups published before that only have the game key ("heim-sv-foo" → "Heimspiel gegen sv foo").
 */
export function matchLabel(game: string): string {
  if (game.includes(" – ")) return `Spiel ${game}`;
  const m = /^(heim|auswaerts)-(.+)$/.exec(game);
  if (!m) return game;
  return `${m[1] === "heim" ? "Heimspiel" : "Auswärtsspiel"} gegen ${m[2].replace(/-/g, " ")}`;
}

/** Whether the person has a place in the published lineup. */
export function inLineup(lineup: Record<string, (string | null)[]> | null, person: number): boolean {
  return Object.values(lineup ?? {}).some((ps) => ps.some((p) => p != null && Number(p) === person));
}

export function cancellationText(player: string, game: string, state: "no" | "maybe" = "no"): { title: string; body: string } {
  player = displayName(player);
  if (state === "maybe") return { title: `Unsicher: ${player}`.slice(0, 100), body: `${player} ist beim ${matchLabel(game)} nur noch unsicher. Die Aufstellung ist bereits veröffentlicht.` };
  return { title: `Absage: ${player}`.slice(0, 100), body: `${player} hat für das ${matchLabel(game)} abgesagt. Die Aufstellung ist bereits veröffentlicht.` };
}
