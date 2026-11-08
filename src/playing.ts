/**
 * State logic of "Ich spiele" as JS source for the client script PLAYING (layout.ts). A string rather
 * than functions because it runs in the browser; tests build it with new Function (see test/playing.test.ts).
 *
 * Per match a player answers yes, maybe or no; unanswered is the absence of the key. Older versions
 * stored a plain list of previewName keys, each meaning yes, which migratePlaying still reads.
 */
export const PLAYING_STATE = `var PLAYING_NEXT = { "": "yes", yes: "maybe", maybe: "no", no: "" };
function nextPlaying(state) { return PLAYING_NEXT[state || ""] || ""; }
function migratePlaying(raw) {
  var out = {};
  if (Array.isArray(raw)) {
    raw.forEach(function (k) { if (typeof k === "string") out[k] = "yes"; });
  } else if (raw && typeof raw === "object") {
    Object.keys(raw).forEach(function (k) {
      if (raw[k] === "yes" || raw[k] === "maybe" || raw[k] === "no") out[k] = raw[k];
    });
  }
  return out;
}`;
