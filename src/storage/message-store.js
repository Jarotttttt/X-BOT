import { db, stmt } from "./database.js";
import { serializeMessage, deserializeMessage, toTimestamp, unwrapAll } from "../shared/utils.js";
import { LRUCache } from "./lru.js";

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
    this.cache = new LRUCache(1000);
    this.prune();
    const pruneTimer = globalThis.setInterval(() => this.prune(), 60 * 60 * 1000);
    pruneTimer?.unref?.();
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

    const res = stmt.messages.upsert.run({
      remoteJid,
      keyId,
      timestamp: ts,
      raw,
    });

    this.cache.set(keyId, {
      id: res.lastInsertRowid,
      remote_jid: remoteJid,
      key_id: keyId,
      timestamp: ts,
      raw: message,
    });

    return res;
  }

  getByKeyId(keyId) {
    if (!keyId) return null;
    const cached = this.cache.get(keyId);
    if (cached) return cached;

    const row = stmt.messages.getByKeyId.get({ keyId });
    if (!row) return null;

    const parsed = { ...row, raw: deserializeMessage(row.raw) };
    this.cache.set(keyId, parsed);
    return parsed;
  }
}

export const messageStore = new MessageStore();
