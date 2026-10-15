// Self-check for caption alignment: `node test_build.mjs` prints "ok" or throws.
import assert from "node:assert/strict";
import { timedWords, captionGroups } from "./build_video.mjs";

// Whisper merged "Big O" into "Big-O": the unmatched narration words get interpolated times.
const whisper = [
  { text: "Big-O", start: 0.1, end: 0.6 },
  { text: "gives", start: 0.7, end: 1.0 },
  { text: "an", start: 1.05, end: 1.15 },
  { text: "upper", start: 1.2, end: 1.5 },
  { text: "bound.", start: 1.55, end: 2.0 },
];
const w = timedWords("Big O gives an upper bound.", whisper, 2.5);
assert.deepEqual(w.map((x) => x.text), ["Big", "O", "gives", "an", "upper", "bound."]);
assert.equal(w[2].start, 0.7); // matched words keep whisper times
assert.ok(w[0].start >= 0.1 && w[1].end <= 0.7 && w[0].end <= w[1].start); // interpolated, ordered
for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].start);

// No transcript: words spread over the clip.
const est = timedWords("one two three", null, 3);
assert.ok(est[0].start > 0 && est[2].end < 3);

// Groups break at sentence ends.
const g = captionGroups(timedWords("First sentence here. Second one.", null, 4));
assert.deepEqual(g.map((x) => x.text), ["First sentence here.", "Second one."]);
console.log("ok");
