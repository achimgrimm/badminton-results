import assert from "node:assert/strict";
import test from "node:test";
import { cancellationText, inLineup, matchLabel } from "../supabase/functions/_shared/cancellation-push.ts";

test("matchLabel reads the game key", () => {
  assert.equal(matchLabel("heim-sv-foo"), "Heimspiel gegen sv foo");
  assert.equal(matchLabel("auswaerts-bar"), "Auswärtsspiel gegen bar");
  assert.equal(matchLabel("other"), "other");
});

test("inLineup finds a person in any slot", () => {
  const l = { "1.HD": ["1", "2"], DE: [null] };
  assert.equal(inLineup(l, 2), true);
  assert.equal(inLineup(l, 3), false);
  assert.equal(inLineup(null, 1), false);
});

test("cancellationText names player and match", () => {
  const t = cancellationText("Max M.", "heim-foo");
  assert.equal(t.title, "Absage: Max M.");
  assert.match(t.body, /Max M\. hat für das Heimspiel gegen foo abgesagt/);
});

test("cancellationText for maybe", () => {
  const t = cancellationText("Max M.", "heim-foo", "maybe");
  assert.equal(t.title, "Unsicher: Max M.");
  assert.match(t.body, /nur noch unsicher/);
});
