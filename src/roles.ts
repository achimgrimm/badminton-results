/** Role names as stored in public.roles (supabase/migrations), strongest first, with their German labels. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  team_lead: "Mannschaftsführer",
  member: "Mitglied",
};

/** The roles an admin may grant or revoke in the app; member is implicit. */
export const ASSIGNABLE_ROLES = ["team_lead", "admin"] as const;

export interface RoleUser {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
}

/** Strongest role first, then by name (email as fallback). Does not mutate the input. */
export function sortUsers<T extends RoleUser>(users: readonly T[]): T[] {
  const rank = (u: T) => {
    const i = Object.keys(ROLE_LABELS).findIndex((r) => u.roles.includes(r));
    return i < 0 ? Object.keys(ROLE_LABELS).length : i;
  };
  const name = (u: T) => (u.display_name || u.email || "").toLowerCase();
  return [...users].sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b), "de"));
}

/** Mirrors the guards of set_user_role in the database, so the UI can disable the button. */
export function canRevokeRole(selfId: string, targetId: string, role: string, adminCount: number): boolean {
  if (role !== "admin") return true;
  return targetId !== selfId && adminCount > 1;
}

/** The label of the strongest role the user holds; null without any known role. */
export function roleLabel(roles: readonly string[]): string | null {
  const top = Object.keys(ROLE_LABELS).find((r) => roles.includes(r));
  return top ? ROLE_LABELS[top] : null;
}
