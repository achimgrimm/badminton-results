import { displayName } from "./names.ts";

/** Role names as stored in public.roles (supabase/migrations), strongest first, with their German labels. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  team_lead: "Mannschaftsführer",
  player: "Spieler",
  member: "Mitglied",
};

/** The roles an admin may grant or revoke in the app; member is implicit. */
export const ASSIGNABLE_ROLES = ["team_lead", "admin"] as const;

export interface RoleUser {
  user_id: string;
  display_name: string | null;
  email: string | null;
  roles: string[];
  /** The account's chosen player ("Nachname, Vorname"), when it has one. */
  player_name?: string | null;
}

/** What the admin list shows for an account: the player's name, else the login name, else the email. */
export function userLabel(u: RoleUser): string {
  return (u.player_name ? displayName(u.player_name) : u.display_name || u.email) || "Unbekannt";
}

/** By first name, then last name (player name, else login name, else email). Does not mutate the input. */
export function sortUsers<T extends RoleUser>(users: readonly T[]): T[] {
  const parts = (u: T): [string, string] => {
    const words = (u.player_name ? displayName(u.player_name) : u.display_name || u.email || "").trim().split(/\s+/);
    return words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : [words[0], ""];
  };
  const cmp = (x: string, y: string) => x.localeCompare(y, "de", { sensitivity: "base" });
  return [...users].sort((a, b) => {
    const [fa, la] = parts(a), [fb, lb] = parts(b);
    return cmp(fa, fb) || cmp(la, lb);
  });
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
