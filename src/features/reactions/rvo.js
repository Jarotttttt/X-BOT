import { messageStore } from "../../storage/message-store.js";

// Media types yang didukung untuk RVO
const MEDIA_TYPES = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  ptvMessage: "ptv",
  documentMessage: "document",
  stickerMessage: "sticker",
};

/**
 * Detect apakah message adalah view-once.
 * Return inner message-nya kalau iya, null kalau bukan.
 */
function extractViewOnceInner(message) {
  if (!message) return null;

  const inner =
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message;

  if (inner) return inner;

  for (const field of Object.keys(MEDIA_TYPES)) {
    if (message[field]?.viewOnce) return message;
  }

  return null;
}

/**
 * Detect tipe media dari inner message.
 */
function detectMediaType(inner) {
  for (const [field, type] of Object.entries(MEDIA_TYPES)) {
    if (inner[field]) return { field, type };
  }
  return null;
}

/**
 * 👁️ RVO reaction — reveal view-once message.
 * React 👁️ ke pesan view-once, bot kirim ulang medianya.
 */
export async function rvoReaction(sock, jid, reaction) {
  const targetId = reaction?.key?.id;
  if (!targetId) return;

  try {
    // Ambil message dari store
    const stored = messageStore.getByKeyId(targetId);
    if (!stored) {
      console.log("[rvo] message not in store:", targetId);
      return;
    }

    const rawMessage = stored.message;
    if (!rawMessage) return;

    // Cek apakah view-once
    const viewOnceInner = extractViewOnceInner(rawMessage);
    if (!viewOnceInner) {
      console.log("[rvo] bukan view-once:", targetId);
      return;
    }

    // Detect tipe media
    const media = detectMediaType(viewOnceInner);
    if (!media) {
      console.log("[rvo] tidak ada media:", targetId);
      return;
    }

    console.log("[rvo]", media.type, "dari", targetId);

    // Download media (strip viewOnce flag)
    const strippedForDownload = {
      ...viewOnceInner,
      [media.field]: { ...viewOnceInner[media.field], viewOnce: false },
    };
    const buffer = Buffer.from(await sock.message.downloadBytes(strippedForDownload));

    // Ambil metadata
    const mediaObj = viewOnceInner[media.field];
    const caption = mediaObj.caption || "";
    const mimetype = mediaObj.mimetype || "";
    const fileName = mediaObj.fileName || undefined;

    // Re-send tanpa viewOnce
    await sock.message.send(jid, {
      type: media.type,
      media: buffer,
      ...(mimetype && { mimetype }),
      ...(caption && { caption }),
      ...(fileName && { fileName }),
    });
  } catch (err) {
    console.error("[rvo] gagal:", err?.message || err);
  }
}
