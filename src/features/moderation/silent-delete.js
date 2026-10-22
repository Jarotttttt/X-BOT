import { delay } from "zapo-js";

const activeDeletes = new Set();

async function silentDelete(sock, key) {
  const { jid, id: stanzaId } = key ?? {};
  if (!sock || !jid || !stanzaId) return;

  const operationKey = `${jid}:${stanzaId}`;
  if (activeDeletes.has(operationKey)) return;
  activeDeletes.add(operationKey);

  try {
    const temp = await sock.message.send(
      jid,
      {
        groupStatusMessageV2: {
          message: {
            extendedTextMessage: {
              text: "",
              contextInfo: { isGroupStatus: true },
            },
          },
        },
      },
      {
        additionalAttributes: { type: "text" },
      },
    );
    const tempId = temp?.id;
    if (!tempId) return;

    const edit = await sock.message.send(
      jid,
      {
        protocolMessage: {
          key: {
            jid,
            fromMe: true,
            id: tempId,
          },
          type: 14,
          editedMessage: {
            extendedTextMessage: {
              text: "\0",
              contextInfo: { isGroupStatus: false },
            },
          },
        },
      },
      {
        id: stanzaId,
      },
    );
    const tempId2 = edit?.id;
    if (!tempId2) return;

    await delay(100);

    await Promise.allSettled([
      sock.message.send(jid, {
        type: "revoke",
        target: { remoteJid: jid, id: tempId, fromMe: true },
      }),
      sock.message.send(jid, {
        type: "revoke",
        target: { remoteJid: jid, id: tempId2, fromMe: true },
      }),
    ]);
  } catch (e) {
    console.error("[dmsg]", e?.message || e);
  } finally {
    activeDeletes.delete(operationKey);
  }
}

export { silentDelete };
