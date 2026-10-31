import sharp from "sharp";

/**
 * Compress buffer jadi JPEG max 720x720 quality 80.
 * Throw kalau bukan gambar valid.
 */
async function compressImage(buffer) {
  const meta = await sharp(buffer).metadata();
  const exceeds = (meta.width || 0) > 720 || (meta.height || 0) > 720;
  return sharp(buffer)
    .resize(exceeds ? { width: 720, height: 720, fit: "inside" } : undefined)
    .jpeg({ quality: 80 })
    .toBuffer();
}

/**
 * !setpp — ganti foto profil bot.
 *
 * Cara pakai (dikirim oleh bot sendiri di grup/DM):
 *   - !setpp <url gambar>
 *   - !setpp (reply ke pesan yang berisi gambar)
 *   - kirim gambar dengan caption !setpp
 */
export async function setProfilePictureCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    let buffer;

    // Prioritas 1: pesan ini sendiri adalah gambar (caption !setpp)
    if (event.message?.imageMessage) {
      buffer = Buffer.from(await sock.message.downloadBytes(event.message));
    }

    // Prioritas 2: reply ke pesan gambar
    if (!buffer) {
      const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quoted?.imageMessage) {
        buffer = Buffer.from(await sock.message.downloadBytes(quoted));
      }
    }

    // Prioritas 3: URL dari args
    if (!buffer && args[0]) {
      const url = args[0];
      if (!/^https?:\/\//i.test(url)) {
        return reply("❌ Format salah. Contoh:\n> !setpp (reply gambar)\n> !setpp <url gambar>\n> kirim gambar dengan caption !setpp");
      }
      const res = await fetch(url);
      if (!res.ok) return reply(`❌ Gagal unduh gambar: ${res.status} ${res.statusText}`);
      buffer = Buffer.from(await res.arrayBuffer());
    }

    if (!buffer) {
      return reply("❌ Tidak ada gambar ditemukan.\n\nCara pakai:\n> !setpp (reply gambar)\n> !setpp <url gambar>\n> kirim gambar dengan caption !setpp");
    }

    // Compress
    let compressed;
    try {
      compressed = await compressImage(buffer);
    } catch (err) {
      return reply(`❌ File bukan gambar yang valid: ${err.message}`);
    }

    // Set foto profil
    await sock.profile.setProfilePicture(compressed);
    return reply("✅ Foto profil bot berhasil diganti.");
  } catch (err) {
    console.error("[setpp] gagal:", err?.message || err);
    return reply(`❌ Gagal: ${err?.message || err}`);
  }
}
