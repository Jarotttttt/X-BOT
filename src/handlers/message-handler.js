import { isSelf } from "../shared/utils.js";
import { silentDelete } from "../features/moderation/silent-delete.js";
import { deleteReaction } from "../features/reactions/delete.js";
import { isMuted, toggleMute } from "../features/reactions/mute.js";
import { setFakeText, fakeEditReaction } from "../features/reactions/fake-text.js";
import { notifyReaction } from "../features/reactions/notify.js";
import { setCustomSticker, annotateStickerReaction } from "../features/reactions/sticker.js";
import { rvoReaction } from "../features/reactions/rvo.js";

const recentReactions = new Map();
const DEDUP_TTL_MS = 10_000;
const MAX_RECENT_REACTIONS = 500;

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

async function routeReaction(sock, jid, reaction) {
  if (!reaction?.text || !reaction?.key?.id || isDuplicateReaction(reaction)) return true;

  const text = normalizeReactionText(reaction.text);
  console.log("[reaction]", reaction.text, "on target:", reaction.key.id);

  if (text === "👾") return deleteReaction(sock, jid, reaction);
  if (text === "🤫") return toggleMute(sock, jid, reaction);
  if (text === "👍") return setFakeText(reaction);
  if (text === "❤") return fakeEditReaction(sock, jid, reaction);
  if (text === "💚") return notifyReaction(sock, jid, reaction);
  if (text === "⭐") return setCustomSticker(reaction);
  if (text === "🗿") return annotateStickerReaction(sock, jid, reaction);
  if (text === "👁") return rvoReaction(sock, jid, reaction);

  return false;
}

export async function handleMessage(event, sock) {
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

export async function handleAddon(event, sock) {
  try {
    if (event?.kind !== "reaction" || !sock) return;
    const jid = event.key?.remoteJid;
    if (!jid || (!isSelf(event.key, sock) && !event.fromMe)) return;
    await routeReaction(sock, jid, event.decrypted?.reaction);
  } catch (error) {
    console.error("[handler] error in handleAddon:", error?.message || error);
  }
}
