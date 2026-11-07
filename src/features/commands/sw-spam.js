import { delay } from "zapo-js";
import { getStatusRecipients } from "../status/recipients.js";

let isSpamming = false;
let stopRequested = false;

export async function swSpamCommand(sock, jid, args) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  if (!sock?.status?.send) {
    return reply("❌ Fitur Status WhatsApp tidak didukung pada bot client.");
  }

  const sub = (args[0] || "").toLowerCase();

  if (sub === "stop" || sub === "batal" || sub === "cancel") {
    if (!isSpamming) {
      return reply("ℹ️ Tidak ada proses `!swspam` yang sedang berjalan.");
    }
    stopRequested = true;
    return reply("🛑 *Permintaan stop diterima.* Menghentikan spam status...");
  }

  if (isSpamming) {
    return reply("⚠️ Masih ada proses `!swspam` yang sedang berjalan! Ketik `!swspam stop` untuk membatalkan.");
  }

  let count = Number.parseInt(args[0], 10);
  if (Number.isNaN(count) || count < 1) {
    count = 100;
  }

  if (count > 200) {
    return reply("⚠️ Batas maksimal adalah 200 status dalam satu sesi demi keamanan akun WhatsApp.");
  }

  const template = !Number.isNaN(Number.parseInt(args[0], 10))
    ? args.slice(1).join(" ").trim()
    : args.join(" ").trim();

  const recipients = getStatusRecipients();
  if (!recipients || recipients.length === 0) {
    return reply("❌ Daftar kontak penerima status kosong.");
  }

  isSpamming = true;
  stopRequested = false;

  await reply(
    `🚀 *Memulai SW Spam...*\n` +
      `• Total Status: *${count}*\n` +
      `• Target: *${recipients.length} kontak aktif*\n` +
      `• Format: _${template ? template.replace(/\{n\}/g, "1") : "Angka 1 s/d " + count}_\n\n` +
      `_Ketik \`!swspam stop\` kapan saja untuk menghentikan._`,
  );

  let successCount = 0;
  let failedCount = 0;

  try {
    for (let i = 1; i <= count; i++) {
      if (stopRequested) {
        console.log("[swspam] dihentikan oleh user pada hitungan:", i - 1);
        break;
      }

      let text = "";
      if (template) {
        text = template.includes("{n}") ? template.replace(/\{n\}/g, String(i)) : `${template} ${i}`;
      } else {
        text = String(i);
      }

      try {
        await sock.status.send({
          content: {
            type: "text",
            text,
          },
          recipients,
          statusSetting: "contacts",
        });
        successCount++;
      } catch (err) {
        console.error(`[swspam] gagal kirim status ke-${i}:`, err?.message || err);
        failedCount++;
      }

      if (i < count) {
        await delay(600);
      }
    }

    const statusNote = stopRequested ? "🛑 *Dihentikan oleh user!*" : "🎉 *Selesai!*";
    return reply(
      `${statusNote}\n\n` +
        `• Berhasil diupload: *${successCount}*\n` +
        `• Gagal: *${failedCount}*\n` +
        `• Total target: *${recipients.length} kontak*`,
    );
  } catch (err) {
    console.error("[swspam] fatal error:", err?.message || err);
    return reply(`❌ Error saat menjalankan spam status: ${err?.message || err}`);
  } finally {
    isSpamming = false;
    stopRequested = false;
  }
}
