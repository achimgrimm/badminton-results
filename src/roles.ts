import { displayName } from "./names.ts";

/** Role names as stored in public.roles (supabase/migrations), strongest first, with their German labels. */
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  team_lead: "Mannschaftsführung",
  player: "Spielende",
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
  /** Usage (#59, admins only): signed-in devices, last sign-in (ISO) and devices with notifications on. */
  devices?: number;
  last_sign_in_at?: string | null;
  push_devices?: number;
  /** Latest token refresh of a valid session (#69, admins only): when the app was last seen. */
  last_seen_at?: string | null;
}

/** The usage lines in the admin list, one labelled fact each; empty when the activity wasn't loaded. */
export function activityLines(u: RoleUser): string[] {
  if (u.devices === undefined || u.push_devices === undefined) return [];
  const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
  const n = (c: number, one: string, many: string) => `${c} ${c === 1 ? one : many}`;
  return [
    u.devices === 0 ? "Angemeldet: nein" : `Angemeldet: ${n(u.devices, "Gerät", "Geräte")}`,
    ...(u.devices > 0 && u.last_seen_at ? [`Zuletzt aktiv: ${when(u.last_seen_at)}`] : []),
    `Letzte Anmeldung: ${u.last_sign_in_at ? when(u.last_sign_in_at) : "noch nie"}`,
    `Benachrichtigungen: ${u.push_devices === 0 ? "aus" : n(u.push_devices, "Gerät", "Geräte")}`,
  ];
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
