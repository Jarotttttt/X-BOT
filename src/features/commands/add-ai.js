const META_AI_JID = "867051314767696@bot";

/**
 * !addai — tambah Meta AI ke grup.
 * Hanya bisa dipakai di grup oleh bot sendiri.
 */
export async function addAiCommand(sock, jid) {
  try {
    await sock.group.addParticipants(jid, [META_AI_JID]);
    await sock.message.send(jid, { type: "text", text: "✅ Meta AI berhasil ditambahkan ke grup." });
  } catch (err) {
    console.error("[addai] gagal:", err?.message || err);
    await sock.message.send(jid, { type: "text", text: `❌ Gagal tambah Meta AI: ${err?.message || err}` });
  }
}
