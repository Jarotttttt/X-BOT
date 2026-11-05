import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { unwrapAll } from "../../shared/utils.js";
import cfg from "../../config.js";

/**
 * Resize buffer gambar agar pas untuk thumbnail preview WhatsApp (JPEG max 500x500 quality 80)
 */
async function processThumbnail(buffer) {
  try {
    return await sharp(buffer)
      .resize({ width: 500, height: 500, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error("[buss] gagal kompres thumbnail:", err?.message || err);
    return buffer;
  }
}

/**
 * !buss <chatText> [| title | greeting]
 *
 * Mengirim WhatsApp Greeting Card dengan contextInfo.externalAdReply.
 * Gambar bisa diambil dari:
 * 1. Reply pesan gambar
 * 2. Kirim pesan gambar dengan caption !buss <text>
 * 3. Default image fallback
 */
export async function bussCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    const rawInput = args ? args.join(" ").trim() : "";
    const parts = rawInput.split("|").map((p) => p.trim());

    const chatText = parts[0] || "Hello Business!";
    const cardTitle = parts[1] || "X-BOT Official";
    const cardGreeting = parts[2] || "Hi Business";

    let imageBuffer = null;

    // 1. Cek jika pesan ini sendiri memiliki gambar (caption !buss)
    const unwrappedCurrent = unwrapAll(event.message);
    if (unwrappedCurrent?.imageMessage) {
      try {
        const raw = await sock.message.downloadBytes(unwrappedCurrent);
        imageBuffer = await processThumbnail(Buffer.from(raw));
      } catch (err) {
        console.error("[buss] gagal unduh media caption:", err?.message || err);
      }
    }

    // 2. Cek jika me-reply gambar
    if (!imageBuffer) {
      const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const unwrappedQuoted = unwrapAll(quoted);
      if (unwrappedQuoted?.imageMessage) {
        try {
          const raw = await sock.message.downloadBytes(unwrappedQuoted);
          imageBuffer = await processThumbnail(Buffer.from(raw));
        } catch (err) {
          console.error("[buss] gagal unduh quoted media:", err?.message || err);
        }
      }
    }

    const contactUrl = `https://wa.me/${cfg.botNumber}`;
    const defaultImageUrl = "https://meguminzap.is-dev.me/u/I4nSz899Qk1pZWw24brRGT2o7k36llV0.jpg";

    const externalAdReply = {
      title: cardTitle,
      body: cardGreeting,
      mediaType: 1,
      thumbnailUrl: defaultImageUrl,
      thumbnail: imageBuffer || Buffer.alloc(0),
      sourceType: "whatsapp",
      sourceId: String(randomBytes(4).readUInt32BE(0)),
      sourceUrl: contactUrl,
      containsAutoReply: false,
      renderLargerThumbnail: true,
      showAdAttribution: false,
      ctwaClid: `clid${randomBytes(8).toString("hex")}`,
      ref: "referencia",
      clickToWhatsappCall: true,
      adContextPreviewDismissed: false,
      sourceApp: "X-BOT",
      automatedGreetingMessageShown: true,
      greetingMessageBody: cardGreeting,
      ctaPayload: `payload${randomBytes(8).toString("hex")}`,
      disableNudge: true,
      originalImageUrl: defaultImageUrl,
      wtwaAdFormat: false,
      containsCtwaFlowsAutoReply: false,
      agmThumbnailStrategy: 0,
      agmTitleStrategy: 0,
      agmSubtitleStrategy: 0,
      agmHeaderInteractionStrategy: 0,
    };

    await sock.message.send(jid, {
      extendedTextMessage: {
        text: chatText,
        contextInfo: {
          externalAdReply,
        },
      },
    });

    console.log(`[buss] greeting card terkirim ke ${jid}: "${chatText}"`);
  } catch (err) {
    console.error("[buss] error:", err?.message || err);
    return reply(`❌ Gagal kirim greeting card: ${err?.message || err}`);
  }
}
