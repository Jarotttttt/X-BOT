import { delay } from "zapo-js";
import { serializeMessage, deserializeMessage, unwrapAll } from "../../shared/utils.js";
import { messageStore } from "../../storage/message-store.js";
import { stmt } from "../../storage/database.js";

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

export async function setCustomSticker(reaction) {
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

export async function annotateStickerReaction(sock, jid, reaction) {
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
