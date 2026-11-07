const MEDIA_TYPES = {
  imageMessage: "image",
  videoMessage: "video",
  audioMessage: "audio",
  ptvMessage: "ptv",
  documentMessage: "document",
  stickerMessage: "sticker",
};

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

function detectMediaType(inner) {
  for (const [field, type] of Object.entries(MEDIA_TYPES)) {
    if (inner[field]) return { field, type };
  }
  return null;
}

export async function rvoCommand(sock, jid, event) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    const contextInfo = event.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      return reply("❌ Reply ke pesan view-once dulu baru ketik !rvo");
    }

    const viewOnceInner = extractViewOnceInner(quotedMessage);
    if (!viewOnceInner) {
      return reply("❌ Pesan yang di-reply bukan view-once.");
    }

    const media = detectMediaType(viewOnceInner);
    if (!media) {
      return reply("❌ Tidak ada media yang bisa di-reveal di pesan ini.");
    }

    console.log("[rvo] revealing", media.type, "from", jid);

    const strippedForDownload = {
      ...viewOnceInner,
      [media.field]: { ...viewOnceInner[media.field], viewOnce: false },
    };
    const buffer = Buffer.from(await sock.message.downloadBytes(strippedForDownload));

    const mediaObj = viewOnceInner[media.field];
    const caption = mediaObj.caption || "";
    const mimetype = mediaObj.mimetype || "";
    const fileName = mediaObj.fileName || undefined;

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
