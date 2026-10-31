import test from "node:test";
import assert from "node:assert/strict";
import { isCallerRateLimited, CALL_COOLDOWN_MS, callerCooldowns } from "../src/features/voip/anti-call.js";

test("isCallerRateLimited allows first call and throttles immediate subsequent calls", () => {
  callerCooldowns.clear();
  const peer = "628123456789@s.whatsapp.net";
  const t0 = 1000000;

  // First call should not be limited
  assert.equal(isCallerRateLimited(peer, t0), false);

  // Call after 3 seconds should be throttled
  assert.equal(isCallerRateLimited(peer, t0 + 3000), true);

  // Call after cooldown expires should be allowed
  assert.equal(isCallerRateLimited(peer, t0 + CALL_COOLDOWN_MS + 100), false);
});
