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

  // viewOnceMessage / viewOnceMessageV2 wrapper
  const inner =
    message.viewOnceMessage?.message ??
    message.viewOnceMessageV2?.message ??
    message.viewOnceMessageV2Extension?.message;

  if (inner) return inner;

  // Atau langsung field media dengan flag viewOnce: true
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
 * !rvo — reveal view-once message.
 * Reply ke pesan view-once, bot kirim ulang medianya tanpa viewOnce flag.
 */
export async function rvoCommand(sock, jid, event) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    // Ambil quoted message dari reply
    const contextInfo = event.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      return reply("❌ Reply ke pesan view-once dulu baru ketik !rvo");
    }

    // Unwrap dan cek apakah view-once
    const viewOnceInner = extractViewOnceInner(quotedMessage);
    if (!viewOnceInner) {
      return reply("❌ Pesan yang di-reply bukan view-once.");
    }

    // Detect tipe media
    const media = detectMediaType(viewOnceInner);
    if (!media) {
      return reply("❌ Tidak ada media yang bisa di-reveal di pesan ini.");
    }

    console.log("[rvo] revealing", media.type, "from", jid);

    // Download media dari quoted message (strip viewOnce flag untuk download)
    const strippedForDownload = {
      ...viewOnceInner,
      [media.field]: { ...viewOnceInner[media.field], viewOnce: false },
    };
    const buffer = Buffer.from(await sock.message.downloadBytes(strippedForDownload));

    // Ambil metadata tambahan
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
    return reply(`❌ Gagal reveal: ${err?.message || err}`);
  }
}
