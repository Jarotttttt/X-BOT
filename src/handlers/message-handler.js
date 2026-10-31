import { unwrapMessage, delay } from "zapo-js";
import { isSelf, toUserJid, serializeMessage, deserializeMessage, unwrapAll } from "../shared/utils.js";
import { messageStore } from "../storage/message-store.js";
import { silentDelete } from "../features/moderation/silent-delete.js";
import { fakeEdit } from "../features/moderation/fake-edit.js";
import { stmt } from "../storage/database.js";
import { getContactByJid } from "../storage/contacts.js";

const recentReactions = new Map();
const DEDUP_TTL_MS = 10_000;
const MAX_RECENT_REACTIONS = 500;
const DEFAULT_FAKE_TEXT = "HIDUP JOKOWI!";

function normalizeReactionText(text) {
  return text ? text.replace(/[\uFE00-\uFE0F]/g, "").trim() : "";
}

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
  const rawText = reaction?.text;
  if (!targetId || !rawText) return true;

  const text = normalizeReactionText(rawText);
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
  const rawJids = [...new Set([key?.participant, key?.participantAlt].filter(Boolean).map(toUserJid))];
  const allJids = new Set(rawJids);

  for (const jid of rawJids) {
    const contact = getContactByJid(jid);
    if (contact?.lid_jid) allJids.add(contact.lid_jid);
    if (contact?.pn_jid) allJids.add(contact.pn_jid);
  }

  return [...allJids];
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

async function notifyReaction(sock, jid, reaction) {
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  const sendto = reaction.key.remoteJid ?? jid;
  const much = 5;
  const sabar = 500;

  for (let i = 0; i < much; i++) {
    await sock.message.send(
      sendto,
      {
        messageContextInfo: {
          botMetadata: {
            sessionTransparencyMetadata: {
              disclaimerText: "~ let me know",
              hcaId: `hca_${Date.now()}`,
              sessionTransparencyType: 1,
            },
          },
        },
        reactionMessage: {
          key: {
            remoteJid: sendto,
            id: targetId,
            fromMe: false,
          },
          text: "",
        },
      },
      {
        additionalAttributes: {
          type: "reaction",
        },
      },
    );
    if (i < much - 1) await delay(sabar);
  }
  return true;
}

const ANNOTATION_STICKER = {
  url: "https://mmg.whatsapp.net/v/t62.15575-24/818766779_1129097639778153_6590267083545743956_n.enc?ccb=11-4&oh=01_Q5Aa5gHNe2HdbLE-cWkJXND2kbQ-dPCK_OUE8yMZftwYLe7BsQ&oe=6ADAC196&_nc_sid=5e03e0&mms3=true",
  fileSha256: Buffer.from("Uoa2mnXeustnlPHuKU4SBDRzKn/Tfi7Yn8zDAbYCnos=", "base64"),
  fileEncSha256: Buffer.from("L2lSGKLAk7SXkVhBHuNwy2gyET1OhAcR8O7hTmFx0Ss=", "base64"),
  mediaKey: Buffer.from("rsI+FYArjYdzSdlGH4R6G5OUviYNZmBrFvoAitAlI7U=", "base64"),
  mimetype: "application/was",
  directPath: "/v/t62.15575-24/818766779_1129097639778153_6590267083545743956_n.enc?ccb=11-4&oh=01_Q5Aa5gHNe2HdbLE-cWkJXND2kbQ-dPCK_OUE8yMZftwYLe7BsQ&oe=6ADAC196&_nc_sid=5e03e0",
  isLottie: true,
};

function getActiveAnnotationSticker() {
  const row = stmt.annotationSticker.get.get();
  if (row?.raw) {
    try {
      return deserializeMessage(row.raw);
    } catch {
      return ANNOTATION_STICKER;
    }
  }
  return ANNOTATION_STICKER;
}

async function setCustomSticker(reaction) {
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  const row = messageStore.getByKeyId(targetId);
  const unwrapped = unwrapAll(row?.raw?.message);
  const sticker = unwrapped?.stickerMessage;
  if (!sticker) {
    console.log("[sticker-annotation] target bukan pesan stiker atau tidak ditemukan di store");
    return true;
  }

  const raw = serializeMessage(sticker);
  if (!raw) return true;

  stmt.annotationSticker.set.run({ raw });
  console.log(`[sticker-annotation] stiker aktif berhasil disimpan via react ⭐ (${targetId})`);
  return true;
}

async function annotateStickerReaction(sock, jid, reaction) {
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  const sendto = reaction.key.remoteJid ?? jid;
  const row = messageStore.getByKeyId(targetId);
  const parentKey = row?.raw?.key ?? {
    remoteJid: sendto,
    id: targetId,
    fromMe: reaction.key.fromMe ?? false,
    ...(sendto.endsWith("@g.us") && reaction.key.participant ? { participant: reaction.key.participant } : {}),
  };

  const stickerMessage = getActiveAnnotationSticker();
  const count = 20;
  const intervalMs = 200;

  for (let i = 0; i < count; i++) {
    try {
      await sock.message.send(sendto, {
        messageContextInfo: {
          messageAssociation: {
            associationType: 11,
            parentMessageKey: parentKey,
          },
        },
        stickerMessage,
      });
    } catch (err) {
      console.error("[sticker-annotation] gagal kirim:", err?.message || err);
      break;
    }
    if (i < count - 1) await delay(intervalMs);
  }
  return true;
}

async function routeReaction(sock, jid, reaction) {
  if (!reaction?.text || !reaction?.key?.id || isDuplicateReaction(reaction)) return true;

  console.log("[reaction]", reaction.text, "on target:", reaction.key.id);

  if (reaction.text === "👾") return deleteReaction(sock, jid, reaction);
  if (reaction.text === "🤫") return toggleMute(sock, jid, reaction);
  if (reaction.text.startsWith("👍")) return setFakeText(reaction);
  if (reaction.text.includes("❤") || reaction.text.includes("❤️")) {
    return fakeEditReaction(sock, jid, reaction);
  }
  if (reaction.text.includes("💚")) {
    return notifyReaction(sock, jid, reaction);
  }
  if (reaction.text.includes("⭐") || reaction.text.includes("⭐️")) {
    return setCustomSticker(reaction);
  }
  if (reaction.text.includes("🗿")) {
    return annotateStickerReaction(sock, jid, reaction);
  }
  return false;
}

async function handleMessage(event, sock) {
  try {
    const key = event?.key;
    const jid = key?.remoteJid;
    if (!jid || jid === "status@broadcast") return;

    const self = isSelf(key, sock);

    if (jid.endsWith("@g.us") && !self && key.id && isMuted(key)) {
      await silentDelete(sock, { jid, id: key.id });
      return;
    }

    if (self && event.message?.reactionMessage) {
      await routeReaction(sock, jid, event.message.reactionMessage);
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
