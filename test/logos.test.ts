import { test } from "node:test";
import assert from "node:assert/strict";
import { clubFor, logoExtension, logoPath } from "../src/logos.ts";
import type { Club } from "../src/types.ts";

const clubs: Club[] = [
  { id: 1, name: "SV Weyhe", logo: "1.png" },
  { id: 2, name: "TV Eiche Horn", logo: "2.jpg" },
  { id: 3, name: "SG Findorff", logo: null },
  { id: 4, name: "SV Weyhe Süd", logo: "4.png" },
  { id: 5, name: "Neu" },
];

test("a team belongs to the club named at the start", () => {
  assert.equal(clubFor("SV Weyhe IV", clubs)?.id, 1);
  assert.equal(clubFor("TV Eiche Horn V", clubs)?.id, 2);
  assert.equal(clubFor("TV Eiche Horn", clubs)?.id, 2);
});

test("the longest matching club name wins, and only numerals may follow", () => {
  assert.equal(clubFor("SV Weyhe Süd II", clubs)?.id, 4);
  assert.equal(clubFor("SV Weyhenhausen", clubs), null);
  assert.equal(clubFor("SV Weyhe Jugend", clubs), null);
  assert.equal(clubFor("Unbekannt", clubs), null);
});

test("logo path: own club, club with logo, without, unknown", () => {
  assert.equal(logoPath("OT Bremen III", clubs), "club-logo.png");
  assert.equal(logoPath("OT Bremen", clubs), "club-logo.png");
  assert.equal(logoPath("SV Weyhe IV", clubs), "logos/1.png");
  assert.equal(logoPath("SG Findorff II", clubs), null);
  assert.equal(logoPath("Neu", clubs), null);
  assert.equal(logoPath("Unbekannt", clubs), null);
});

test("only image types are kept", () => {
  assert.deepEqual(["image/png", "image/jpeg; charset=x", "image/svg+xml", "text/html", ""].map(logoExtension), ["png", "jpg", "svg", null, null]);
});
