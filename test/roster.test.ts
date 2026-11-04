import { test } from "node:test";
import assert from "node:assert/strict";
import { poolTypes, teamRoster } from "../src/roster.ts";
import { teamNumber } from "../src/parse/club.ts";
import type { PoolRow } from "../src/parse/pools.ts";

const row = (rank: number, team: number | null, name: string, person: number): PoolRow => ({ rank, team, name, person });

test("teamNumber and poolTypes from the team label", () => {
  assert.equal(teamNumber("Aktive"), 1);
  assert.equal(teamNumber("Aktive III"), 3);
  assert.equal(teamNumber("Jugend II"), 2);
  assert.deepEqual(poolTypes("Aktive III"), ["O19 Herren", "O19 Damen"]);
  assert.deepEqual(poolTypes("Schüler"), ["U15 Schüler (gemischt)"]);
  assert.deepEqual(poolTypes("Mini"), []);
});

test("teamRoster: Stammspieler of the team plus reserves, from all age classes", () => {
  const pools = {
    "O19 Herren": { vorrunde: [row(1, 1, "A, Erster", 1), row(9, 3, "B, Dritter", 2), row(13, null, "C, Reserve", 3)], rueckrunde: [] },
    "O19 Damen": { vorrunde: [row(5, 3, "D, Dame", 4)] },
  };
  assert.deepEqual(teamRoster("Aktive III", pools).map((p) => [p.person, p.role]), [[2, "team"], [3, "reserve"], [4, "team"]]);
  assert.deepEqual(teamRoster("Aktive", pools).map((p) => [p.person, p.role]), [[1, "team"], [3, "reserve"]]);
});

test("teamRoster prefers the Rückrunde once it has entries", () => {
  const pools = { "U19 Jugend (gemischt)": { vorrunde: [row(1, 1, "Alt, A", 1)], rueckrunde: [row(1, 1, "Neu, N", 2)] } };
  assert.deepEqual(teamRoster("Jugend", pools).map((p) => p.person), [2]);
});
