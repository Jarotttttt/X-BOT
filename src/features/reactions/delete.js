import { silentDelete } from "../moderation/silent-delete.js";

export async function deleteReaction(sock, jid, reaction) {
  if (!jid.endsWith("@g.us")) return false;
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  await silentDelete(sock, { jid: reaction.key.remoteJid ?? jid, id: targetId });
  return true;
}
