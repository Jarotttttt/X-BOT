import { delay } from "zapo-js";

const FAKE_EDIT_TYPE = 14;
const activeEdits = new Set();

async function fakeEdit(sock, options) {
  const { jid, id: stanzaId, text } = options ?? {};
  if (!sock || !jid || !stanzaId || !text) {
    console.log("[fakemsg] parameter kurang lengkap:", { jid, stanzaId, text });
    return;
  }

  const operationKey = `${jid}:${stanzaId}`;
  if (activeEdits.has(operationKey)) return;
  activeEdits.add(operationKey);

  try {
    console.log("[fakemsg] mulai proses ke stanzaId:", stanzaId, "dengan teks:", text);

    const temp = await sock.message.send(jid, {
      extendedTextMessage: {
        text: "",
        contextInfo: { isGroupStatus: true },
      },
    });
    const tempId = temp?.id;
    console.log("[fakemsg] temp 1 id:", tempId);
    if (!tempId) return;

    const edit = await sock.message.send(
      jid,
      {
        protocolMessage: {
          key: {
            remoteJid: jid,
            fromMe: true,
            id: tempId,
          },
          type: FAKE_EDIT_TYPE,
          editedMessage: {
            extendedTextMessage: {
              text,
              contextInfo: { isGroupStatus: false },
            },
          },
        },
      },
      { id: stanzaId },
    );
    const tempId2 = edit?.id;
    console.log("[fakemsg] temp 2 id:", tempId2);
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
    console.log("[fakemsg] selesai dikirim & di-revoke untuk stanzaId:", stanzaId);
  } catch (err) {
    console.error("[fakemsg] gagal:", err?.message || err);
  } finally {
    activeEdits.delete(operationKey);
  }
}

export { fakeEdit };
