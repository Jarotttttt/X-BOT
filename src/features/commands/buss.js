import { randomBytes } from "node:crypto";
import { setTimeout, clearTimeout } from "node:timers";
import sharp from "sharp";
import { toUserJid } from "zapo-js";
import { unwrapAll } from "../../shared/utils.js";
import cfg from "../../config.js";

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

async function fetchImageFromUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } catch (err) {
    console.warn("[buss] gagal unduh gambar dari url:", err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getSelfProfilePicture(sock) {
  try {
    const creds = sock?.getCredentials?.();
    const meUserJid = creds?.meJid ? toUserJid(creds.meJid) : `${cfg.botNumber}@s.whatsapp.net`;
    const pic = await sock.profile.getProfilePicture(meUserJid, "image");
    if (pic?.url) {
      const buffer = await fetchImageFromUrl(pic.url);
      if (buffer) {
        return {
          url: pic.url,
          buffer: await processThumbnail(buffer),
        };
      }
      return { url: pic.url, buffer: null };
    }
  } catch (err) {
    console.warn("[buss] gagal ambil foto profil sendiri:", err?.message || err);
  }
  return null;
}

function parseBussFlags(args) {
  const raw = args ? args.join(" ").trim() : "";
  if (!raw) {
    return {
      text: "Hello Business!",
      title: "X-BOT Official",
      body: "Hi Business",
      url: `https://wa.me/${cfg.botNumber}`,
      imgUrl: null,
    };
  }

  const flagRegex = /--(t|text|title|body|url|img|image)\s+([^--]+)/gi;
  const matches = [...raw.matchAll(flagRegex)];

  if (matches.length === 0) {
    const parts = raw.split("|").map((p) => p.trim());
    return {
      text: parts[0] || "Hello Business!",
      title: parts[1] || "X-BOT Official",
      body: parts[2] || "Hi Business",
      url: `https://wa.me/${cfg.botNumber}`,
      imgUrl: null,
    };
  }

  const result = {
    text: "Hello Business!",
    title: "X-BOT Official",
    body: "Hi Business",
    url: `https://wa.me/${cfg.botNumber}`,
    imgUrl: null,
  };

  for (const match of matches) {
    const flag = match[1].toLowerCase();
    const val = match[2].trim();
    if (!val) continue;

    if (flag === "t" || flag === "text") {
      result.text = val;
    } else if (flag === "title") {
      result.title = val;
    } else if (flag === "body") {
      result.body = val;
    } else if (flag === "url") {
      result.url = val.startsWith("http") ? val : `https://${val}`;
    } else if (flag === "img" || flag === "image") {
      result.imgUrl = val.startsWith("http") ? val : `https://${val}`;
    }
  }

  return result;
}

export async function bussCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    const parsed = parseBussFlags(args);

    let imageBuffer = null;
    let finalImageUrl = parsed.imgUrl;

    if (parsed.imgUrl) {
      const fetched = await fetchImageFromUrl(parsed.imgUrl);
      if (fetched) {
        imageBuffer = await processThumbnail(fetched);
      }
    }

    if (!imageBuffer) {
      const unwrappedCurrent = unwrapAll(event.message);
      if (unwrappedCurrent?.imageMessage) {
        try {
          const raw = await sock.message.downloadBytes(unwrappedCurrent);
          imageBuffer = await processThumbnail(Buffer.from(raw));
        } catch (err) {
          console.error("[buss] gagal unduh media caption:", err?.message || err);
        }
      }
    }

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

    if (!imageBuffer) {
      const selfPic = await getSelfProfilePicture(sock);
      if (selfPic?.buffer) {
        imageBuffer = selfPic.buffer;
        finalImageUrl = selfPic.url;
      } else if (selfPic?.url) {
        finalImageUrl = selfPic.url;
      }
    }

    const fallbackImageUrl = "https://meguminzap.is-dev.me/u/I4nSz899Qk1pZWw24brRGT2o7k36llV0.jpg";
    finalImageUrl = finalImageUrl || fallbackImageUrl;

    const externalAdReply = {
      title: parsed.title,
      body: parsed.body,
      mediaType: 1,
      thumbnailUrl: finalImageUrl,
      thumbnail: imageBuffer || Buffer.alloc(0),
      sourceType: "whatsapp",
      sourceId: String(randomBytes(4).readUInt32BE(0)),
      sourceUrl: parsed.url,
      containsAutoReply: false,
      renderLargerThumbnail: true,
      showAdAttribution: false,
      ctwaClid: `clid${randomBytes(8).toString("hex")}`,
      ref: "referencia",
      clickToWhatsappCall: true,
      adContextPreviewDismissed: false,
      sourceApp: "X-BOT",
      automatedGreetingMessageShown: true,
      greetingMessageBody: parsed.body,
      ctaPayload: `payload${randomBytes(8).toString("hex")}`,
      disableNudge: true,
      originalImageUrl: finalImageUrl,
      wtwaAdFormat: false,
      containsCtwaFlowsAutoReply: false,
      agmThumbnailStrategy: 0,
      agmTitleStrategy: 0,
      agmSubtitleStrategy: 0,
      agmHeaderInteractionStrategy: 0,
    };

    await sock.message.send(jid, {
      extendedTextMessage: {
        text: parsed.text,
        contextInfo: {
          externalAdReply,
        },
      },
    });

    console.log(`[buss] greeting card terkirim ke ${jid}: "${parsed.text}" (foto profil digunakan)`);
  } catch (err) {
    console.error("[buss] error:", err?.message || err);
    return reply(`❌ Gagal kirim greeting card: ${err?.message || err}`);
  }
}
