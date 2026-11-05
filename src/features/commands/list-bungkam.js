import { stmt } from "../../storage/database.js";
import { formatContact, getContactByJid } from "../../storage/contacts.js";

/**
 * Format timestamp UNIX ke string waktu lokal yang rapi
 */
function formatTime(unixSec) {
  if (!unixSec) return "-";
  const date = new Date(unixSec * 1000);
  return date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * !listbungkam / !listmute — Menampilkan daftar semua user yang sedang dibungkam/mute.
 */
export async function listBungkamCommand(sock, jid) {
  const reply = (text) => sock.message.send(jid, { type: "text", text });

  try {
    const rows = stmt.muted.getAll.all();

    if (!rows || rows.length === 0) {
      return reply("📋 *DAFTAR BUNGKAM (MUTED)*\n\nTidak ada user yang sedang dibungkam.");
    }

    // Kelompokkan entri agar pasangan LID dan Nomor Telepon yang sama tidak muncul dobel
    const seenIdentities = new Set();
    const listEntries = [];

    for (const row of rows) {
      const contact = getContactByJid(row.jid);
      const identityKey = contact?.pn_jid || contact?.lid_jid || row.jid;

      if (seenIdentities.has(identityKey)) continue;
      seenIdentities.add(identityKey);

      const label = formatContact(row.jid);
      const timeStr = formatTime(row.updated_at);
      listEntries.push(`• *${label}*\n  └ Dibungkam: ${timeStr} WIB`);
    }

    const message = [
      `📋 *DAFTAR USER DIBUNGKAM (${listEntries.length})*`,
      `_Pesan dari user di bawah otomatis dihapus senyap._`,
      "",
      ...listEntries,
      "",
      `_Ketik/react 🤫 pada pesan user untuk unmute._`,
    ].join("\n");

    return reply(message);
  } catch (err) {
    console.error("[listbungkam] error:", err?.message || err);
    return reply(`❌ Gagal mengambil daftar bungkam: ${err?.message || err}`);
  }
}
