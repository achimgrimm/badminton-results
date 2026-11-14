import assert from "node:assert/strict";
import test from "node:test";
import { canRevokeRole, roleLabel, sortUsers } from "../src/roles.ts";

test("roleLabel picks the strongest role", () => {
  assert.equal(roleLabel(["member"]), "Mitglied");
  assert.equal(roleLabel(["member", "team_lead"]), "Mannschaftsführer");
  assert.equal(roleLabel(["team_lead", "admin", "member"]), "Administrator");
  assert.equal(roleLabel([]), null);
  assert.equal(roleLabel(["unknown"]), null);
});

test("sortUsers puts the strongest role first, then sorts by name", () => {
  const u = (id: string, name: string, roles: string[]) => ({ user_id: id, display_name: name, email: null, roles });
  const sorted = sortUsers([u("1", "Zora", ["member"]), u("2", "Bea", ["member", "team_lead"]), u("3", "Max", ["admin"]), u("4", "Anna", ["member"])]);
  assert.deepEqual(sorted.map((x) => x.user_id), ["3", "2", "4", "1"]);
});

test("canRevokeRole mirrors the database guards", () => {
  assert.equal(canRevokeRole("a", "b", "team_lead", 1), true);
  assert.equal(canRevokeRole("a", "a", "admin", 3), false);
  assert.equal(canRevokeRole("a", "b", "admin", 1), false);
  assert.equal(canRevokeRole("a", "b", "admin", 2), true);
});

test("roleLabel: player ranks between team lead and member", () => {
  assert.equal(roleLabel(["member", "player"]), "Spieler");
  assert.equal(roleLabel(["member", "player", "team_lead"]), "Mannschaftsführer");
});

test("sortUsers: players come before plain members", () => {
  const u = (id: string, name: string, roles: string[]) => ({ user_id: id, display_name: name, email: null, roles });
  const sorted = sortUsers([u("1", "Anna", ["member"]), u("2", "Zora", ["member", "player"])]);
  assert.deepEqual(sorted.map((x) => x.user_id), ["2", "1"]);
});

test("sortUsers sorts by first name, then last name, using the player name when there is one", () => {
  const u = (id: string, display_name: string, player_name: string | null = null) => ({ user_id: id, display_name, email: null, roles: ["member"], player_name });
  const sorted = sortUsers([u("1", "x", "Meier, Anna"), u("2", "Anna Becker"), u("3", "Zed Zoe", "Adler, Bernd")]);
  assert.deepEqual(sorted.map((x) => x.user_id), ["2", "1", "3"]);
});
