/**
 * !menu / !help — menampilkan daftar fitur dan perintah bot (Gaya Compact & Simple).
 */
export async function menuCommand(sock, jid) {
  const menuText = `*X-BOT AUTOMATION*
Status: Active | Engine: zapo-js

*Perintah Teks:*
• \`!menu\` — Daftar perintah
• \`!addai\` — Tambah Meta AI ke grup
• \`!setpp\` — Ganti avatar bot (reply/URL)
• \`!rvo\` — Buka media sekali lihat

*Reaksi Bot (Moderasi):*
👾 \`Hapus\` — Hapus pesan target senyap
🤫 \`Mute\` — Mute/unmute user target
👍 \`Salin\` — Simpan template teks
❤️ \`Edit\` — Timpa teks pesan target
💚 \`Notif\` — Spam reaksi transparansi
⭐ \`Stiker\` — Simpan stiker custom
🗿 \`Spam\` — Kirim 20 stiker anotasi

*Anti-Call (VOIP):*
Otomatis tangani panggilan suara & video via stream media passthrough tanpa beban CPU.`;

  try {
    await sock.message.send(jid, {
      type: "text",
      text: menuText,
    });
  } catch (err) {
    console.error("[menu] gagal kirim menu:", err?.message || err);
  }
}
