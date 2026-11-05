import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import sharp from "sharp";
import { getAllSavedJids } from "../../storage/contacts.js";

/**
 * Optimasi gambar untuk Status WA (Max 2048px, JPEG quality 90)
 */
async function optimizeImageForStatus(buffer) {
  const image = sharp(buffer);
  const meta = await image.metadata();

  const maxDimension = 2048;
  const needsResize = (meta.width || 0) > maxDimension || (meta.height || 0) > maxDimension;

  let pipeline = image;
  if (needsResize) {
    pipeline = pipeline.resize({
      width: meta.width > meta.height ? maxDimension : undefined,
      height: meta.height >= meta.width ? maxDimension : undefined,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  return pipeline.jpeg({ quality: 90, chromaSubsampling: "4:4:4" }).toBuffer();
}

/**
 * Encode video dengan setting "Sweet Spot" WhatsApp Web:
 * H.264 profile High, bitrate 3.2 Mbps, 30fps, audio AAC 128k, faststart.
 * Ini memastikan server WA tidak mengompres ulang video (tanpa pecah/buram).
 */
function transcodeVideoForStatus(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegStatic) {
      return reject(new Error("ffmpeg-static binary tidak tersedia"));
    }

    const args = [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-profile:v", "high",
      "-level:v", "4.1",
      "-preset", "medium",
      "-b:v", "3200k",
      "-maxrate", "3800k",
      "-bufsize", "6000k",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "44100",
      "-movflags", "+faststart",
      outputPath,
    ];

    const proc = spawn(ffmpegStatic, args, { stdio: ["ignore", "ignore", "pipe"] });
    let errOutput = "";

    proc.stderr.on("data", (chunk) => {
      errOutput += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exit code ${code}: ${errOutput.slice(-300)}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

/**
 * Command !sw / !upsw — Upload Media HD ke Status WhatsApp
 * Audiens / Penerima: Kontak yang tersimpan di database bot (getAllSavedJids)
 */
export async function statusUploadCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  if (!sock.status) {
    return reply("❌ Fitur Status WhatsApp tidak didukung pada engine socket bot saat ini.");
  }

  // Caption jika ada
  const caption = args.join(" ").trim();

  // 1. Dapatkan daftar audience (kontak yang tersimpan)
  const savedRecipients = getAllSavedJids();
  if (savedRecipients.length === 0) {
    return reply("⚠️ Tidak ada kontak yang tersimpan di database bot untuk melihat status.");
  }

  // 2. Ambil media dari pesan saat ini atau pesan yang di-reply
  let imageMessage = event.message?.imageMessage;
  let videoMessage = event.message?.videoMessage;

  if (!imageMessage && !videoMessage) {
    const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.imageMessage) imageMessage = quoted.imageMessage;
    if (quoted?.videoMessage) videoMessage = quoted.videoMessage;
  }

  // Jika berupa status teks (bukan media)
  if (!imageMessage && !videoMessage) {
    if (!caption) {
      return reply(
        "❌ *Cara Menggunakan !sw (Status HD):*\n• Kirim / Reply Gambar dengan caption `!sw <keterangan>`\n• Kirim / Reply Video dengan caption `!sw <keterangan>`\n• `!sw <teks>` untuk membuat status berupa teks jernih",
      );
    }

    try {
      await sock.status.send({
        content: caption,
        recipients: savedRecipients,
      });
      return reply(`✅ *Status Teks Berhasil Diupload!*\n👥 Audiens: *${savedRecipients.length}* kontak tersimpan.`);
    } catch (err) {
      console.error("[sw] gagal upload status teks:", err?.message || err);
      return reply(`❌ Gagal upload status: ${err?.message || err}`);
    }
  }

  const tmpDir = os.tmpdir();
  const filePrefix = `sw_${Date.now()}`;

  // PROSES STATUS GAMBAR HD
  if (imageMessage) {
    await reply(`⏳ *Mengoptimalkan gambar HD...*\nSedang memproses tanpa kompresi berlebih...`);
    try {
      const rawBuffer = Buffer.from(await sock.message.downloadBytes({ imageMessage }));
      const hdImageBuffer = await optimizeImageForStatus(rawBuffer);

      await sock.status.send({
        content: {
          type: "image",
          media: hdImageBuffer,
          mimetype: "image/jpeg",
          caption: caption || imageMessage.caption || "",
        },
        recipients: savedRecipients,
      });

      return reply(
        `🎉 *Status Gambar HD Berhasil Diunggah!*\n` +
        `📸 Kualitas: HD Preserved (Sweet Spot WA Web)\n` +
        `👥 Audiens: *${savedRecipients.length}* kontak tersimpan`,
      );
    } catch (err) {
      console.error("[sw] gagal upload gambar:", err?.message || err);
      return reply(`❌ Gagal mengunggah status gambar: ${err?.message || err}`);
    }
  }

  // PROSES STATUS VIDEO HD
  if (videoMessage) {
    const inputVideoPath = path.join(tmpDir, `${filePrefix}_in.mp4`);
    const outputVideoPath = path.join(tmpDir, `${filePrefix}_hd.mp4`);

    await reply(`⏳ *Mengoptimalkan Video HD (Preset Web)...*\nSedang me-render codec H.264 High Profile agar tidak dikompres buram oleh WA...`);

    try {
      const rawVideoBuffer = Buffer.from(await sock.message.downloadBytes({ videoMessage }));
      await fs.writeFile(inputVideoPath, rawVideoBuffer);

      // Transcode dengan setting sweet-spot WhatsApp Web
      await transcodeVideoForStatus(inputVideoPath, outputVideoPath);
      const hdVideoBuffer = await fs.readFile(outputVideoPath);

      await sock.status.send({
        content: {
          type: "video",
          media: hdVideoBuffer,
          mimetype: "video/mp4",
          caption: caption || videoMessage.caption || "",
        },
        recipients: savedRecipients,
      });

      return reply(
        `🎉 *Status Video HD Berhasil Diunggah!*\n` +
        `📹 Encoding: H.264 High 4.1 @ 3.2 Mbps (Anti-Pecah)\n` +
        `👥 Audiens: *${savedRecipients.length}* kontak tersimpan`,
      );
    } catch (err) {
      console.error("[sw] gagal upload video:", err?.message || err);
      return reply(`❌ Gagal mengunggah status video: ${err?.message || err}`);
    } finally {
      // Bersihkan file temporary
      try {
        await fs.unlink(inputVideoPath);
        await fs.unlink(outputVideoPath);
      } catch {
        // ignore
      }
    }
  }
}
