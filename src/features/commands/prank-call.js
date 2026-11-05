import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { CallState } from "@zapo-js/voip";
import { toUserJid } from "../../shared/utils.js";
import { getContactByJid } from "../../storage/contacts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, "../../../assets");
const CUSTOM_AUDIO_PATH = path.join(ASSETS_DIR, "prankcall_custom.mp3");
const DEFAULT_AUDIO_PATH = path.join(ASSETS_DIR, "anticall.mp3");

// Timeout safety jika panggilan tidak kunjung diangkat / berakhir (35 detik)
const CALL_MAX_TIMEOUT_MS = 35_000;

/**
 * Menyimpan audio kustom untuk prank call dari pesan VN / Audio
 */
export async function setPrankAudio(sock, jid, event) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    let audioMessage = null;

    // Prioritas 1: Reply ke pesan audio / voice note
    const quoted = event.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (quoted?.audioMessage) {
      audioMessage = quoted.audioMessage;
    }

    // Prioritas 2: Pesan saat ini adalah audio dengan caption
    if (!audioMessage && event.message?.audioMessage) {
      audioMessage = event.message.audioMessage;
    }

    if (!audioMessage) {
      return reply(
        "❌ *Format salah!*\nReply pesan Audio / Voice Note (VN) dengan perintah `!setprank` untuk mengatur suara prank call.",
      );
    }

    // Download audio buffer menggunakan zapo-js downloadBytes
    const buffer = Buffer.from(await sock.message.downloadBytes({ audioMessage }));
    if (!buffer || buffer.length === 0) {
      return reply("❌ Gagal mengunduh audio. Pastikan media masih valid di WhatsApp.");
    }

    await fs.writeFile(CUSTOM_AUDIO_PATH, buffer);

    return reply(
      `✅ *Audio Prank Berhasil Disimpan!*\nUkuran: ${(buffer.length / 1024).toFixed(1)} KB\n\nSekarang kamu bisa mulai prank call dengan:\n\`!prankcall 628xxxxxxxxxx\``,
    );
  } catch (err) {
    console.error("[setprank] error:", err?.message || err);
    return reply(`❌ Gagal menyimpan audio prank: ${err?.message || err}`);
  }
}

/**
 * Memulai panggilan prank ke target nomor WhatsApp dengan injeksi audio
 */
export async function prankCallCommand(sock, jid, event, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  if (!sock.voip) {
    return reply("❌ Fitur VOIP belum siap atau tidak aktif pada bot.");
  }

  // 1. Ekstrak target JID
  let targetRaw = (args[0] || "").trim();

  // Cek jika user mention (@user)
  const mentions = event.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
  if (mentions.length > 0) {
    targetRaw = mentions[0];
  }

  if (!targetRaw) {
    return reply(
      "❌ *Target tidak ditemukan!*\nContoh penggunaan:\n• `!prankcall 628xxxxxxxxxx`\n• `!prankcall @tagTarget`\n\n_Untuk ganti suara:_ reply VN/Audio dengan `!setprank`",
    );
  }

  let inputJid;
  if (targetRaw.includes("@")) {
    inputJid = toUserJid(targetRaw);
  } else {
    const cleanedNumber = targetRaw.replace(/\D/g, "");
    if (!cleanedNumber || cleanedNumber.length < 8) {
      return reply("❌ Nomor tujuan tidak valid. Masukkan nomor dengan kode negara (contoh: 628123456789).");
    }
    inputJid = `${cleanedNumber}@s.whatsapp.net`;
  }

  // Resolusi kontak: pastikan kita mendapatkan Nomor HP asli (Phone Number JID)
  const contact = getContactByJid(inputJid);
  const phoneJid = contact?.pn_jid || (inputJid.endsWith("@s.whatsapp.net") ? inputJid : null);

  // Selalu prioritaskan panggil ke Nomor Telepon asli (s.whatsapp.net)
  const dialedJid = phoneJid || inputJid;
  const phoneNumber = (phoneJid || inputJid).split("@")[0].split(":")[0];
  const targetDisplay = contact?.push_name
    ? `${contact.push_name} (+${phoneNumber})`
    : `+${phoneNumber}`;

  // 2. Pilih audio file: audio kustom atau fallback ke anticall.mp3
  let activeAudioFile = DEFAULT_AUDIO_PATH;
  try {
    await fs.access(CUSTOM_AUDIO_PATH);
    activeAudioFile = CUSTOM_AUDIO_PATH;
  } catch {
    activeAudioFile = DEFAULT_AUDIO_PATH;
  }

  await reply(
    `📞 *Memanggil Target Prank...*\nTarget: *${targetDisplay}*\nAudio: _${path.basename(activeAudioFile)}_\n\n_Menunggu target mengangkat telepon..._`,
  );

  let callId = null;
  let audioLoaded = false;
  let callTimeout = null;

  // Cleanup helper
  const cleanup = () => {
    if (callTimeout) {
      clearTimeout(callTimeout);
      callTimeout = null;
    }
    sock.off("voip_call_state", onStateChange);
    sock.off("voip_call_outbound_audio_finished", onAudioFinished);
    sock.off("voip_call_ended", onCallEnded);
  };

  // Listener ketika state berubah (misal Active / diangkat)
  const onStateChange = async (call) => {
    if (call.callId !== callId) return;

    if (call.stateData?.state === CallState.Active && !audioLoaded) {
      audioLoaded = true;
      console.log("[prankcall] Panggilan diangkat oleh target:", targetDisplay, "callId:", callId);

      try {
        // Beri jeda 1 detik agar audio channel stabil, lalu load audio
        await new Promise((r) => setTimeout(r, 1000));
        await sock.voip.loadAudio(callId, activeAudioFile);
        console.log("[prankcall] Audio prank berhasil diinjeksi ke target:", callId);
      } catch (err) {
        console.error("[prankcall] Gagal inject audio:", err?.message || err);
        try {
          await sock.voip.endCall(callId);
        } catch {
          // ignore
        }
      }
    }
  };

  // Listener ketika pemutaran audio selesai
  const onAudioFinished = async (call) => {
    if (call.callId !== callId) return;
    console.log("[prankcall] Audio prank selesai diputar. Mengakhiri panggilan:", callId);
    try {
      await sock.voip.endCall(callId);
      await sock.message.send(jid, {
        type: "text",
        text: `🎉 *Prank Call Berhasil!*\nSuara prank telah selesai didengarkan oleh target (${targetDisplay}). 😆`,
      });
    } catch (err) {
      console.error("[prankcall] error ending call on finish:", err?.message || err);
    } finally {
      cleanup();
    }
  };

  // Listener ketika panggilan berakhir
  const onCallEnded = (call) => {
    if (call.callId !== callId) return;
    const endReason = call.stateData?.endReason || "selesai";
    console.log("[prankcall] Panggilan prank berakhir. Alasan:", endReason);

    if (!audioLoaded) {
      sock.message.send(jid, {
        type: "text",
        text: `📵 *Panggilan Tidak Diangkat / Ditolak*\nTarget: ${targetDisplay}\nAlasan: ${endReason}`,
      }).catch(() => {});
    }

    cleanup();
  };

  try {
    sock.on("voip_call_state", onStateChange);
    sock.on("voip_call_outbound_audio_finished", onAudioFinished);
    sock.on("voip_call_ended", onCallEnded);

    // Mulai panggilan keluar 1:1 langsung ke phone JID target
    callId = await sock.voip.startCall({
      peerJid: dialedJid,
      isVideo: false,
    });

    console.log("[prankcall] startCall berhasil dimulai, ID:", callId, "dialed:", dialedJid);

    // Pasang safety timeout jika 35 detik tidak ada respon
    callTimeout = setTimeout(async () => {
      console.log("[prankcall] Timeout panggilan habis untuk:", callId);
      try {
        await sock.voip.endCall(callId);
      } catch {
        // ignore
      }
      cleanup();
    }, CALL_MAX_TIMEOUT_MS);
  } catch (err) {
    cleanup();
    console.error("[prankcall] Gagal memulai panggilan:", err?.message || err);
    return reply(`❌ Gagal melakukan prank call ke ${targetDisplay}: ${err?.message || err}`);
  }
}
