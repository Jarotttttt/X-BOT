import { toUserJid } from "../../shared/utils.js";
import { stmt } from "../../storage/database.js";
import { getContactByJid } from "../../storage/contacts.js";
import { silentDelete } from "../moderation/silent-delete.js";

export function getTargetJids(key) {
  const rawJids = [...new Set([key?.participant, key?.participantAlt].filter(Boolean).map(toUserJid))];
  const allJids = new Set(rawJids);

  for (const jid of rawJids) {
    const contact = getContactByJid(jid);
    if (contact?.lid_jid) allJids.add(contact.lid_jid);
    if (contact?.pn_jid) allJids.add(contact.pn_jid);
  }

  return [...allJids];
}

export function isMuted(key) {
  return getTargetJids(key).some((jid) => stmt.muted.get.get({ jid }));
}

export async function toggleMute(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;

  const targetJids = getTargetJids(reaction.key);
  if (!targetJids.length) return true;

  const muted = targetJids.some((targetJid) => stmt.muted.get.get({ jid: targetJid }));
  for (const targetJid of targetJids) {
    if (muted) stmt.muted.delete.run({ jid: targetJid });
    else stmt.muted.insert.run({ jid: targetJid });
  }

  if (!muted && reaction.key.id) {
    await silentDelete(sock, { jid: reaction.key.remoteJid ?? jid, id: reaction.key.id });
  }
  return true;
}
