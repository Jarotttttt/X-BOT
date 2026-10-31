import { stmt } from "../../storage/database.js";
import { fakeEdit } from "../moderation/fake-edit.js";
import { toUserJid } from "../../shared/utils.js";

/**
 * Helper untuk mengambil nomor dari JID.
 */
function getPhoneNumber(jid) {
  if (!jid) return "";
  return jid.split("@")[0].split(":")[0];
}

/**
 * 🤡 sPR Fake Edit Reaction Handler
 *
 * Mengedit pesan target di grup dengan teks yang menyebut (@user) masing-masing peserta.
 * Template teks diambil dari database (default: "hai @user").
 * Jika ada kata "@user", kata tersebut akan digantikan dengan @nomor peserta grup yang bersangkutan,
 * dan dimasukkan ke dalam contextInfo.mentionedJid agar menjadi mention aktif/berwarna biru!
 */
export async function sprFakeEditReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;

  const targetId = reaction.key?.id;
  if (!targetId) return true;

  try {
    const rawTemplate = stmt.fakeText.get.get()?.text || "hai @user";

    // 1. Ambil metadata grup untuk mendapatkan seluruh peserta
    let groupMeta = null;
    try {
      groupMeta = await sock.group.queryGroupMetadata(jid);
    } catch (err) {
      console.error("[spr-fake] gagal mengambil metadata grup:", err?.message || err);
    }

    const participants = groupMeta?.participants || [];
    const mentionedJid = [];

    // Kumpulkan semua nomor peserta untuk didaftarkan ke mentionedJid
    for (const p of participants) {
      const pJid = toUserJid(p.jid || p.id);
      if (pJid && !mentionedJid.includes(pJid)) {
        mentionedJid.push(pJid);
      }
    }

    // 2. Ekstrak mention statis jika template menggunakan @nomor manual
    const manualMentions = [...rawTemplate.matchAll(/@(\d{8,16})/g)];
    for (const m of manualMentions) {
      const manualJid = `${m[1]}@s.whatsapp.net`;
      if (!mentionedJid.includes(manualJid)) {
        mentionedJid.push(manualJid);
      }
    }

    // 3. Olah teks final:
    // Jika ada token @user, ganti dengan mention tag (misal: @nomor_target atau mention peserta)
    let finalTeks = rawTemplate;
    if (finalTeks.includes("@user")) {
      const targetSender = reaction.key.participant || reaction.key.remoteJid;
      const targetNum = getPhoneNumber(targetSender);
      if (targetNum) {
        finalTeks = finalTeks.replace(/@user/g, `@${targetNum}`);
      } else {
        finalTeks = finalTeks.replace(/@user/g, "@everyone");
      }
    }

    console.log(`[spr-fake] 🤡 trigger fake-edit ke ${targetId} dengan ${mentionedJid.length} mentions`);

    // 4. Eksekusi fakeEdit dengan mentionedJid aktif
    await fakeEdit(sock, {
      jid: reaction.key.remoteJid ?? jid,
      id: targetId,
      text: finalTeks,
      mentionedJid,
    });

    return true;
  } catch (err) {
    console.error("[spr-fake] error:", err?.message || err);
    return false;
  }
}
