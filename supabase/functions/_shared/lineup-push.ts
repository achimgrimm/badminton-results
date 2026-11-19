/** Who gets which push when a lineup is published or changed. Pure, so it is tested with the app's tests. */
export type Lineup = Record<string, (string | null)[]>;

export type Notice = { person: string; kind: "published" | "changed" | "removed"; games: string[] };

/** Per person: discipline → partner ids (sorted, "-" for none), so a changed partner counts as a change. */
function placements(lineup: Lineup | null): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const [game, persons] of Object.entries(lineup ?? {})) {
    for (const p of persons) {
      if (!p) continue;
      const partners = persons.filter((q): q is string => !!q && q !== p).sort().join(",") || "-";
      if (!out.has(p)) out.set(p, new Map());
      out.get(p)!.set(game, partners);
    }
  }
  return out;
}

/**
 * The pushes for a change from prev (null = nothing was published before) to next. Players who are in next get
 * "published" (first publication) or "changed" (their games or partners differ); players only in prev get "removed";
 * players whose games are unchanged get nothing, so republishing the same lineup is silent.
 */
export function lineupNotices(prev: Lineup | null, next: Lineup): Notice[] {
  const before = placements(prev), after = placements(next), out: Notice[] = [];
  for (const [person, games] of after) {
    const old = before.get(person);
    const same = old && old.size === games.size && [...games].every(([g, partners]) => old.get(g) === partners);
    if (same) continue;
    out.push({ person, kind: prev ? "changed" : "published", games: [...games.keys()] });
  }
  for (const [person, games] of before) if (!after.has(person)) out.push({ person, kind: "removed", games: [...games.keys()] });
  return out;
}

/** The push text (German, like the app). */
export function noticeText(n: Notice, match: string): { title: string; body: string } {
  const title = `Aufstellung ${match}`.slice(0, 100);
  const games = n.games.join(", ");
  if (n.kind === "removed") return { title, body: "Aufstellung geändert: Du bist nicht mehr aufgestellt." };
  if (n.kind === "published") return { title, body: `Aufstellung veröffentlicht: Du spielst ${games}.` };
  return { title, body: `Aufstellung geändert: Du spielst jetzt ${games}.` };
}

/** The publisher's own confirmation when they are not placed in the lineup: how many players were notified. */
export function confirmText(match: string, notified: number): { title: string; body: string } {
  const title = `Aufstellung ${match}`.slice(0, 100);
  const who = notified === 0 ? "Niemand wurde neu benachrichtigt" : notified === 1 ? "1 Person wurde benachrichtigt" : `${notified} Personen wurden benachrichtigt`;
  return { title, body: `Aufstellung veröffentlicht. ${who}.` };
}
