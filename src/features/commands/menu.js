export async function menuCommand(sock, jid) {
  const menuText = `*X-BOT AUTOMATION*
Status: Active | Engine: zapo-js

*Perintah Teks:*
• \`!menu\` — Daftar perintah
• \`!sw <teks/reply>\` — Upload status WhatsApp (152 kontak aktif)
• \`!swspam <jumlah> [teks]\` — Spam upload status WhatsApp
• \`!swspam stop\` — Stop proses spam status
• \`!sw hapus\` — Hapus status WhatsApp terakhir
• \`!listbungkam\` — Lihat daftar user dibungkam/mute
• \`!prankcall <nomor/@user>\` — Panggilan prank bersuara ke nomor WA
• \`!setprank\` — Set suara prank (reply Audio/VN)
• \`!buss --t <pesan> [--title <judul>] [--body <desc>] [--img <url>]\` — Kirim WA Business Card custom
• \`!addai\` — Tambah Meta AI ke grup
• \`!setpp\` — Ganti avatar bot (reply gambar)
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
