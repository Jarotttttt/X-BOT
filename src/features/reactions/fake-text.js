import { unwrapMessage } from "zapo-js";
import { messageStore } from "../../storage/message-store.js";
import { stmt } from "../../storage/database.js";
import { fakeEdit } from "../moderation/fake-edit.js";

const DEFAULT_FAKE_TEXT = "HIDUP JOKOWI!";

function getTargetText(reaction) {
  const row = messageStore.getByKeyId(reaction?.key?.id);
  const message = row?.raw?.message;
  if (!message) return null;

  const unwrapped = unwrapMessage(message);
  const text =
    unwrapped?.conversation ??
    unwrapped?.extendedTextMessage?.text ??
    unwrapped?.imageMessage?.caption ??
    unwrapped?.videoMessage?.caption;

  return text?.trim() || null;
}

export async function setFakeText(reaction) {
  const targetId = reaction.key?.id;
  const text = getTargetText(reaction);
  if (!targetId || !text) {
    console.log("[fakemsg] gagal set teks dari react: teks pesan target tidak ditemukan di store");
    return true;
  }

  stmt.fakeText.set.run({ text });
  console.log(`[fakemsg] template teks berhasil disetel via react 👍: "${text}"`);
  return true;
}

export async function fakeEditReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  const savedText = stmt.fakeText.get.get()?.text;
  const text = savedText || DEFAULT_FAKE_TEXT;
  console.log("[fakemsg] trigger fake-edit target:", targetId, "teks:", text);
  if (!targetId) return true;

  await fakeEdit(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId, text });
  return true;
}
