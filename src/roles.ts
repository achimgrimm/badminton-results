/** Role names as stored in public.roles (supabase/migrations), strongest first, with their German labels. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  team_lead: "Mannschaftsführer",
  member: "Mitglied",
};

export const MAX_NAME_LENGTH = 60;

/** The label of the strongest role the user holds; null without any known role. */
export function roleLabel(roles: readonly string[]): string | null {
  const top = Object.keys(ROLE_LABELS).find((r) => roles.includes(r));
  return top ? ROLE_LABELS[top] : null;
}

/** A display name as typed: whitespace trimmed and collapsed; null when empty or too long. */
export function cleanDisplayName(input: string): string | null {
  const name = input.replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= MAX_NAME_LENGTH ? name : null;
}
