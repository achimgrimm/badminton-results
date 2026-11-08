/** "Böse, Frank" -> "Frank Böse" */
export function displayName(name: string): string {
  const m = name.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : name;
}

/** Letters only, lowercase, without accents: "Böse, Frank" and "frank  BOESE" both give the tokens frank, bos. */
function nameTokens(name: string): string[] {
  return name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ß/g, "ss")
    // "Böse" (stripped to "bose") and "Boese" are the same name; both sides get the same treatment
    .replace(/([aou])e/g, "$1")
    .split(/[^a-z]+/).filter(Boolean);
}

/**
 * The roster player whose name is the same as the account's, ignoring case, accents, punctuation and
 * the order ("Nachname, Vorname" vs "Vorname Nachname"). Only a single exact match counts; no match
 * or several (two players with the same name) give null.
 */
export function matchPlayer<T extends { name: string }>(accountName: string, roster: readonly T[]): T | null {
  const key = (n: string) => nameTokens(n).sort().join(" ");
  const wanted = key(accountName);
  if (!wanted.includes(" ")) return null; // a single word is not a name to trust
  const hits = roster.filter((p) => key(p.name) === wanted);
  return hits.length === 1 ? hits[0] : null;
}
