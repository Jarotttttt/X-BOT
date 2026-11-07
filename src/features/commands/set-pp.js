import sharp from "sharp";

async function compressImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const exceeds = (meta.width || 0) > 720 || (meta.height || 0) > 720;
  return sharp(buffer)
    .resize(exceeds ? { width: 720, height: 720, fit: "inside" } : undefined)
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function setProfilePictureCommand(sock, jid, event) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted?.imageMessage) {
      return reply("❌ *Format salah!*\nReply pesan gambar dengan perintah `!setpp` untuk mengganti foto profil bot.");
    }

    const buffer = Buffer.from(await sock.message.downloadBytes(quoted));
    if (!buffer || buffer.length === 0) {
      return reply("❌ Gagal mengunduh gambar. Pastikan gambar masih valid di WhatsApp.");
    }

    let compressed;
    try {
      compressed = await compressImage(buffer);
    } catch (err) {
      return reply(`❌ File bukan gambar yang valid: ${err.message}`);
    }

    await sock.profile.setProfilePicture(compressed);
    return reply("✅ Foto profil bot berhasil diganti.");
  } catch (err) {
    console.error("[setpp] gagal:", err?.message || err);
    return reply(`❌ Gagal: ${err?.message || err}`);
  }
}
