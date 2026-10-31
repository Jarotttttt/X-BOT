import { delay } from "zapo-js";

export async function notifyReaction(sock, jid, reaction) {
  const targetId = reaction.key?.id;
  if (!targetId) return true;

  const sendto = reaction.key.remoteJid ?? jid;
  const much = 5;
  const sabar = 500;

  for (let i = 0; i < much; i++) {
    await sock.message.send(
      sendto,
      {
        messageContextInfo: {
          botMetadata: {
            sessionTransparencyMetadata: {
              disclaimerText: "~ let me know",
              hcaId: `hca_${Date.now()}`,
              sessionTransparencyType: 1,
            },
          },
        },
        reactionMessage: {
          key: {
            remoteJid: sendto,
            id: targetId,
            fromMe: false,
          },
          text: "",
        },
      },
      {
        additionalAttributes: {
          type: "reaction",
        },
      },
    );
    if (i < much - 1) await delay(sabar);
  }
  return true;
}
