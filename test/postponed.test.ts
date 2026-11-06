import { test } from "node:test";
import assert from "node:assert/strict";
import { postponedLabel } from "../src/render/util.ts";

test("postponedLabel shortens nuLiga's note", () => {
  const note = "verlegt, ursprünglicher Termin: Sa. 14.11.2026 19:00";
  assert.equal(postponedLabel({ date: "2026-11-14", note }), "verlegt (vorher 19:00 Uhr)");
  assert.equal(postponedLabel({ date: "2026-11-15", note }), "verlegt (vorher Sa, 14.11., 19:00 Uhr)");
  assert.equal(
    postponedLabel({ date: "2026-09-12", note: "Halle verlegt/verlegt, ursprünglicher Termin: Sa. 12.09.2026 17:00" }),
    "Halle und Termin verlegt (vorher 17:00 Uhr)",
  );
  assert.equal(postponedLabel({ date: "2026-09-12", note: "Halle verlegt" }), "Halle verlegt");
  assert.equal(postponedLabel({ date: "2026-09-12", note: null }), "verlegt");
});
