import { unwrapMessage } from "zapo-js";

import { isSelf, toUserJid } from "./src/utils.js";
import { messageStore } from "./src/store.js";
import { silentDelete } from "./src/silent-delete.js";
import { fakeEdit } from "./src/fake-edit.js";
import { stmt } from "./src/db.js";

const recentReactions = new Map();
const DEDUP_TTL_MS = 10_000;

function isDuplicateReaction(reaction) {
  const targetId = reaction?.key?.id;
  const text = reaction?.text;
  if (!targetId || !text) return true;

  const key = `${targetId}:${text}`;
  const now = Date.now();
  const last = recentReactions.get(key) ?? 0;
  if (now - last < DEDUP_TTL_MS) return true;

  recentReactions.set(key, now);
  setTimeout(() => recentReactions.delete(key), DEDUP_TTL_MS);
  return false;
}

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

async function deleteReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  await silentDelete(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId });
  console.log(`[silent-delete] pesan ${targetId} berhasil dihapus senyap`);
  return true;
}

function getTargetJids(key) {
  return [...new Set([key?.participant, key?.participantAlt].filter(Boolean).map(toUserJid))];
}

function isMuted(key) {
  return getTargetJids(key).some((jid) => stmt.muted.get.get({ jid }));
}

async function toggleMute(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;

  const targetJids = getTargetJids(reaction.key);
  if (!targetJids.length) return true;

  const muted = targetJids.some((targetJid) => stmt.muted.get.get({ jid: targetJid }));
  for (const targetJid of targetJids) {
    if (muted) stmt.muted.delete.run({ jid: targetJid });
    else stmt.muted.insert.run({ jid: targetJid });
  }

  if (!muted && reaction.key.id) {
    await silentDelete(sock, { jid: reaction.key.remoteJid ?? jid, id: reaction.key.id });
  }
  console.log(`[bungkam] ${targetJids.join(", ")} ${muted ? "dibebaskan" : "dibungkam"}`);
  return true;
}

async function setFakeText(reaction) {
  const targetId = reaction.key?.id;
  const text = getTargetText(reaction);
  if (!targetId || !text) return true;

  stmt.fakeText.set.run({ text });
  console.log(`[fakemsg] template teks berhasil disetel: "${text}"`);
  return true;
}

async function fakeEditReaction(sock, jid, reaction, withMentions = false) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  const text = stmt.fakeText.get.get()?.text;
  if (!targetId || !text) return true;

  await fakeEdit(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId, text, withMentions });
  console.log(`[fakemsg] pesan ${targetId} berhasil di-fake-edit ${withMentions ? "(hidetag)" : ""}: "${text}"`);
  return true;
}

async function routeReaction(sock, jid, reaction) {
  if (!reaction?.text || !reaction?.key?.id || isDuplicateReaction(reaction)) return true;

  if (reaction.text === "👾") return deleteReaction(sock, jid, reaction);
  if (reaction.text === "🤫") return toggleMute(sock, jid, reaction);
  if (reaction.text.startsWith("👍")) return setFakeText(reaction);
  if (reaction.text === "📢" || reaction.text === "📣") {
    return fakeEditReaction(sock, jid, reaction, true);
  }
  if (reaction.text.includes("❤") || reaction.text.includes("❤️")) {
    return fakeEditReaction(sock, jid, reaction, false);
  }
  return false;
}

async function handleMessage(event, sock) {
  try {
    const key = event?.key;
    const jid = key?.remoteJid;
    if (!jid) return;

    const self = isSelf(key, sock);

    if (jid.endsWith("@g.us") && !self && key.id && isMuted(key)) {
      await silentDelete(sock, { jid, id: key.id });
      console.log(`[bungkam] pesan ${key.id} dihapus senyap`);
      return;
    }

    if (self && event.message?.reactionMessage) {
      await routeReaction(sock, jid, event.message.reactionMessage);
    }
  } catch (error) {
    console.error("[handler] error in handleMessage:", error);
  }
}

async function handleAddon(event, sock) {
  try {
    if (event?.kind !== "reaction" || !sock) return;
    const jid = event.key?.remoteJid;
    if (!jid || (!isSelf(event.key, sock) && !event.fromMe)) return;
    await routeReaction(sock, jid, event.decrypted?.reaction);
  } catch (error) {
    console.error("[handler] error in handleAddon:", error);
  }
}

export { handleMessage, handleAddon };
