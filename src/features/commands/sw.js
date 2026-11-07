import sharp from "sharp";
import { unwrapAll } from "../../shared/utils.js";
import { getStatusRecipients } from "../status/recipients.js";

let lastUploadedStatusId = null;

async function optimizeStatusImage(buffer) {
  try {
    const meta = await sharp(buffer).metadata();
    const exceeds = (meta.width || 0) > 1280 || (meta.height || 0) > 1280;
    return await sharp(buffer)
      .resize(exceeds ? { width: 1280, height: 1280, fit: "inside", withoutEnlargement: true } : undefined)
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.warn("[sw] gagal optimasi gambar, menggunakan raw buffer:", err?.message || err);
    return buffer;
  }
}

export async function statusCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  if (!sock?.status?.send) {
    return reply("❌ Fitur Status WhatsApp tidak didukung atau belum siap pada bot client.");
  }

  const subCommand = (args[0] || "").toLowerCase();

  if (subCommand === "hapus" || subCommand === "revoke" || subCommand === "delete") {
    if (!lastUploadedStatusId) {
      return reply("❌ Belum ada status yang diunggah melalui bot pada sesi ini.");
    }

    try {
      const recipients = getStatusRecipients();
      await sock.status.revokeStatus({
        messageId: lastUploadedStatusId,
        recipients,
        statusSetting: "contacts",
      });
      const deletedId = lastUploadedStatusId;
      lastUploadedStatusId = null;
      return reply(`✅ Status dengan ID \`${deletedId}\` berhasil dihapus.`);
    } catch (err) {
      console.error("[sw] gagal revoke status:", err?.message || err);
      return reply(`❌ Gagal menghapus status: ${err?.message || err}`);
    }
  }

  const recipients = getStatusRecipients();
  if (!recipients || recipients.length === 0) {
    return reply("❌ Daftar kontak penerima kosong. Pastikan database kontak bot terisi.");
  }

  try {
    const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const unwrappedQuoted = unwrapAll(quoted);

    let content = null;

    if (unwrappedQuoted?.imageMessage) {
      const rawBuffer = Buffer.from(await sock.message.downloadBytes(unwrappedQuoted));
      const optimized = await optimizeStatusImage(rawBuffer);
      const caption = args.join(" ").trim() || unwrappedQuoted.imageMessage.caption || undefined;
      content = {
        type: "image",
        media: optimized,
        mimetype: "image/jpeg",
        ...(caption && { caption }),
      };
    } else if (unwrappedQuoted?.videoMessage) {
      const buffer = Buffer.from(await sock.message.downloadBytes(unwrappedQuoted));
      const caption = args.join(" ").trim() || unwrappedQuoted.videoMessage.caption || undefined;
      const mimetype = unwrappedQuoted.videoMessage.mimetype || "video/mp4";
      content = {
        type: "video",
        media: buffer,
        mimetype,
        ...(caption && { caption }),
      };
    } else if (unwrappedQuoted?.audioMessage) {
      const buffer = Buffer.from(await sock.message.downloadBytes(unwrappedQuoted));
      const mimetype = unwrappedQuoted.audioMessage.mimetype || "audio/mp4";
      content = {
        type: "audio",
        media: buffer,
        mimetype,
      };
    }

    if (!content) {
      const text = args.join(" ").trim();
      if (!text) {
        return reply(
          "❌ *Format Penggunaan !sw*\n\n" +
            "• `!sw <teks>` : Upload status berupa teks.\n" +
            "• Reply gambar/video/audio dengan `!sw [caption]` : Upload status media.\n" +
            "• `!sw hapus` : Hapus status terakhir yang diupload.\n\n" +
            `_Target penerima aktif: ${recipients.length} kontak._`,
        );
      }
      content = {
        type: "text",
        text,
      };
    }

    await reply(`⏳ *Mengunggah Status WhatsApp...*\nMendistribusikan ke *${recipients.length} kontak aktif*...`);

    const result = await sock.status.send({
      content,
      recipients,
      statusSetting: "contacts",
    });

    if (result?.id) {
      lastUploadedStatusId = result.id;
    }

    return reply(
      `✅ *Status WhatsApp Berhasil Diunggah!*\n` +
        `• Tipe: _${content.type}_\n` +
        `• Stanza ID: \`${result?.id || "-"}\`\n` +
        `• Penerima: *${recipients.length} kontak*\n\n` +
        `_Ketik \`!sw hapus\` jika ingin membatalkan/menghapus status ini._`,
    );
  } catch (err) {
    console.error("[sw] gagal upload status:", err?.message || err);
    return reply(`❌ Gagal mengunggah status: ${err?.message || err}`);
  }
}
