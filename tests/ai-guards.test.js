import test from "node:test";
import assert from "node:assert/strict";

import { isGroupMessageTargetingBot, createGenerationTracker } from "../src/features/ai/guards.js";

const normalize = (jid) => jid?.replace(/:\d+(?=@)/, "").toLowerCase() ?? null;

test("group mention by phone JID targets the bot", () => {
  assert.equal(
    isGroupMessageTargetingBot(
      { extendedTextMessage: { contextInfo: { mentionedJid: ["123:4@s.whatsapp.net"] } } },
      { meJid: "123@s.whatsapp.net" },
      normalize,
    ),
    true,
  );
});

test("group quote reply targets the bot by LID", () => {
  assert.equal(
    isGroupMessageTargetingBot(
      { extendedTextMessage: { contextInfo: { participant: "bot@lid" } } },
      { meLid: "bot@lid" },
      normalize,
    ),
    true,
  );
});

test("ordinary group message does not target the bot", () => {
  assert.equal(
    isGroupMessageTargetingBot(
      { extendedTextMessage: { contextInfo: { mentionedJid: ["other@s.whatsapp.net"] } } },
      { meJid: "bot@s.whatsapp.net" },
      normalize,
    ),
    false,
  );
});

test("generation tracker invalidates older in-flight replies", () => {
  const tracker = createGenerationTracker();
  const first = tracker.next("chat");
  const second = tracker.next("chat");
  assert.equal(tracker.isCurrent("chat", first), false);
  assert.equal(tracker.isCurrent("chat", second), true);
});
