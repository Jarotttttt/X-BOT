import { db, stmt } from "./database.js";
import { serializeMessage, deserializeMessage, toTimestamp, unwrapAll } from "../shared/utils.js";

const UNSTORABLE_STUBS = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "reactionMessage",
  "encReactionMessage",
  "unavailableMessage",
]);

const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

function isStorableMessage(message) {
  if (!message) return false;
  if (message.messageStubType && UNSTORABLE_STUBS.has(message.messageStubType)) return false;

  const raw = message.message;
  if (!raw) return false;

  const unwrapped = unwrapAll(raw);
  if (!unwrapped) return false;

  if (
    unwrapped.protocolMessage ||
    unwrapped.reactionMessage ||
    unwrapped.encReactionMessage ||
    unwrapped.senderKeyDistributionMessage
  ) {
    return false;
  }

  return !!(
    unwrapped.conversation ||
    unwrapped.extendedTextMessage?.text ||
    unwrapped.imageMessage ||
    unwrapped.videoMessage ||
    unwrapped.audioMessage ||
    unwrapped.documentMessage ||
    unwrapped.stickerMessage ||
    unwrapped.contactMessage ||
    unwrapped.contactsArrayMessage ||
    unwrapped.locationMessage ||
    unwrapped.liveLocationMessage ||
    unwrapped.pollCreationMessage ||
    unwrapped.pollCreationMessageV2 ||
    unwrapped.pollCreationMessageV3
  );
}

class MessageStore {
  constructor() {
    const { count } = stmt.messages.count.get();
    console.log(`[message-store] loaded ${count} messages`);
    this.prune();
    globalThis.setInterval(() => this.prune(), 60 * 60 * 1000);
  }

  prune() {
    try {
      const nowSec = Math.floor((Date.now() - RETENTION_MS) / 1000);
      const res = stmt.messages.pruneOld.run({ threshold: nowSec });
      if (res.changes > 0) {
        console.log(`[message-store] dibersihkan ${res.changes} pesan lama (> 3 hari)`);
        db.pragma("wal_checkpoint(TRUNCATE)");
      }
    } catch (err) {
      console.error("[message-store] gagal membersihkan pesan lama:", err);
    }
  }

  insert(message) {
    const remoteJid = message.key?.remoteJid;
    const keyId = message.key?.id;

    if (!remoteJid || !keyId) return;
    if (!isStorableMessage(message)) return;

    const raw = serializeMessage(message);
    if (!raw) return;

    const ts = toTimestamp(message.messageTimestamp ?? message.timestampSeconds) ?? Math.floor(Date.now() / 1000);

    return stmt.messages.upsert.run({
      remoteJid,
      keyId,
      timestamp: ts,
      raw,
    });
  }

  getByKeyId(keyId) {
    const row = stmt.messages.getByKeyId.get({ keyId });
    if (!row) return null;

    return { ...row, raw: deserializeMessage(row.raw) };
  }
}

export const messageStore = new MessageStore();
