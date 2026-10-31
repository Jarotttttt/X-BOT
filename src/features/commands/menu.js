/**
 * !menu / !help — menampilkan daftar fitur dan perintah bot.
 */
export async function menuCommand(sock, jid) {
  const menuText = `╭─「 *X-BOT DASHBOARD* 」
│
├ 🤖 *TEXT COMMANDS (Prefix !)*
│ • *!menu* : Menampilkan daftar menu ini
│ • *!addai* : Tambah Meta AI ke grup (khusus grup)
│ • *!setpp* : Ganti foto profil bot (reply/caption/URL)
│ • *!rvo* : Reveal media view-once (reply pesan)
│
├ ⚡ *REACTION MODERATION (Akun Bot)*
│ • 👾 : Silent Delete pesan target
│ • 🤫 : Toggle Mute pengirim target (LID/PN)
│ • 👍 : Simpan template teks fake edit
│ • ❤️ : Eksekusi Fake Edit pesan target
│ • 💚 : Reaksi transparansi sesi (5x notify)
│ • ⭐ : Simpan custom stiker anotasi
│ • 🗿 : Spam 20 stiker anotasi ke target
│
├ 📞 *VOIP AUTOMATION*
│ • Anti-Call Audio: Otomatis tolak & inject audio
│ • Anti-Call Video: Stream pre-transcoded video/audio
│ • Auto-Upgrade: Handle permintaan upgrade ke video
│
╰─「 *X-BOT v1.0.0* 」`;

  try {
    await sock.message.send(jid, {
      type: "text",
      text: menuText,
    });
  } catch (err) {
    console.error("[menu] gagal kirim menu:", err?.message || err);
  }
}
