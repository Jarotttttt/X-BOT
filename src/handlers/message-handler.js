import { unwrapMessage } from "zapo-js";
import { isSelf, toUserJid } from "../shared/utils.js";
import { messageStore } from "../storage/message-store.js";
import { silentDelete } from "../features/moderation/silent-delete.js";
import { fakeEdit } from "../features/moderation/fake-edit.js";
import { stmt } from "../storage/database.js";
import path from "node:path";

const BADGE_STICKER_PATH = path.resolve(import.meta.dirname, "../../assets/badge-prabowo.webp");

const recentReactions = new Map();
const DEDUP_TTL_MS = 10_000;
const MAX_RECENT_REACTIONS = 500;
const DEFAULT_FAKE_TEXT = "HIDUP JOKOWI!";

function cleanupRecentReactions(now) {
  for (const [k, timestamp] of recentReactions.entries()) {
    if (now - timestamp >= DEDUP_TTL_MS) {
      recentReactions.delete(k);
    } else {
      break;
    }
  }

  while (recentReactions.size > MAX_RECENT_REACTIONS) {
    const oldestKey = recentReactions.keys().next().value;
    if (oldestKey !== undefined) {
      recentReactions.delete(oldestKey);
    } else {
      break;
    }
  }
}

function isDuplicateReaction(reaction) {
  const targetId = reaction?.key?.id;
  const text = reaction?.text;
  if (!targetId || !text) return true;

  const key = `${targetId}:${text}`;
  const now = Date.now();

  cleanupRecentReactions(now);

  const last = recentReactions.get(key);
  if (last !== undefined && now - last < DEDUP_TTL_MS) {
    return true;
  }

  recentReactions.set(key, now);
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

async function setFakeText(reaction) {
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

async function deleteReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  await silentDelete(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId });
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
  return true;
}

async function fakeEditReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  const savedText = stmt.fakeText.get.get()?.text;
  const text = savedText || DEFAULT_FAKE_TEXT;
  console.log("[fakemsg] trigger fake-edit target:", targetId, "teks:", text);
  if (!targetId) return true;

  await fakeEdit(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId, text });
  return true;
}

async function badgeReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  await sock.message.send(
    jid,
    {
      type: "sticker",
      media: BADGE_STICKER_PATH,
      mimetype: "image/webp",
      contextInfo: {
        raw: {
          messageAssociation: {
            associationType: 11,
            parentMessageKey: reaction.key,
          },
        },
      },
    },
  );
  console.log("[badge] stiker badge terasosiasi ke pesan:", targetId);
  return true;
}

async function routeReaction(sock, jid, reaction) {
  if (!reaction?.text || !reaction?.key?.id || isDuplicateReaction(reaction)) return true;

  console.log("[reaction]", reaction.text, "on target:", reaction.key.id);

  if (reaction.text === "👾") return deleteReaction(sock, jid, reaction);
  if (reaction.text === "🤫") return toggleMute(sock, jid, reaction);
  if (reaction.text === "😹") return badgeReaction(sock, jid, reaction);
  if (reaction.text.startsWith("👍")) return setFakeText(reaction);
  if (reaction.text.includes("❤") || reaction.text.includes("❤️")) {
    return fakeEditReaction(sock, jid, reaction);
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
      return;
    }

    if (self && event.message?.reactionMessage) {
      await routeReaction(sock, jid, event.message.reactionMessage);
      return;
    }
  } catch (error) {
    console.error("[handler] error in handleMessage:", error?.message || error);
  }
}

async function handleAddon(event, sock) {
  try {
    if (event?.kind !== "reaction" || !sock) return;
    const jid = event.key?.remoteJid;
    if (!jid || (!isSelf(event.key, sock) && !event.fromMe)) return;
    await routeReaction(sock, jid, event.decrypted?.reaction);
  } catch (error) {
    console.error("[handler] error in handleAddon:", error?.message || error);
  }
}

export { handleMessage, handleAddon };
