import assert from "node:assert/strict";
import test from "node:test";
import { matchPlayer } from "../src/names.ts";

const roster = [
  { person: 1, name: "Böse, Frank" },
  { person: 2, name: "Müller, Anna-Lena" },
  { person: 3, name: "Schmidt, Tim" },
  { person: 4, name: "Schmidt, Tim" },
  { person: 5, name: "Wachtel, Samira" },
];

test("matches the account name with a roster name in either order, ignoring case and accents", () => {
  assert.equal(matchPlayer("Frank Böse", roster)?.person, 1);
  assert.equal(matchPlayer("frank boese", roster)?.person, 1);
  assert.equal(matchPlayer("Böse, Frank", roster)?.person, 1);
  assert.equal(matchPlayer("Anna Lena Mueller", roster)?.person, 2);
  assert.equal(matchPlayer("  SAMIRA   wachtel ", roster)?.person, 5);
});

test("no match for unknown, partial or ambiguous names", () => {
  assert.equal(matchPlayer("Frank", roster), null);
  assert.equal(matchPlayer("Frank Meier", roster), null);
  assert.equal(matchPlayer("Tim Schmidt", roster), null);
  assert.equal(matchPlayer("", roster), null);
  assert.equal(matchPlayer("Frank Böse Junior", roster), null);
});
