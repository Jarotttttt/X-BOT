import test from "node:test";
import assert from "node:assert/strict";
import { CallMediaType } from "@zapo-js/voip";

import { shouldLoadIncomingCallAudio } from "../src/features/voip/media-policy.js";

test("incoming audio calls keep the existing audio injection", () => {
  assert.equal(shouldLoadIncomingCallAudio({ mediaType: CallMediaType.Audio }), true);
});

test("incoming video calls never inject the anticall MP3", () => {
  assert.equal(shouldLoadIncomingCallAudio({ mediaType: CallMediaType.Video }), false);
});

test("unknown call media types do not inject audio", () => {
  assert.equal(shouldLoadIncomingCallAudio({}), false);
});
