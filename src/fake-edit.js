import { delay } from "zapo-js";

const FAKE_EDIT_TYPE = 14;
const activeEdits = new Set();

async function getGroupParticipants(sock, jid) {
  if (!jid.endsWith("@g.us") || !sock?.group?.queryGroupMetadata) return [];
  try {
    const meta = await sock.group.queryGroupMetadata(jid);
    return meta?.participants?.map((p) => p.jid || p.phoneNumber || p.lid).filter(Boolean) || [];
  } catch (err) {
    console.error("[fakeEdit] gagal query group metadata:", err);
    return [];
  }
}

async function fakeEdit(sock, options) {
  const { jid, id: stanzaId, text, withMentions = false } = options ?? {};
  if (!sock || !jid || !stanzaId || !text) return;

  if (activeEdits.has(stanzaId)) return;
  activeEdits.add(stanzaId);

  try {
    const participants = withMentions ? await getGroupParticipants(sock, jid) : [];
    const contextInfo = {
      isGroupStatus: false,
      ...(participants.length > 0 ? { mentionedJid: participants } : {}),
    };

    const temp = await sock.message.send(jid, {
      extendedTextMessage: {
        text: "",
        contextInfo: { isGroupStatus: true },
      },
    });
    const tempId = temp?.id;
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
              contextInfo,
            },
          },
        },
      },
      { id: stanzaId },
    );
    const tempId2 = edit?.id;
    if (!tempId2) return;

    await delay(100);

    await Promise.allSettled([
      sock.message.send(jid, {
        type: "revoke",
        target: { id: tempId, fromMe: true },
      }),
      sock.message.send(jid, {
        type: "revoke",
        target: { id: tempId2, fromMe: true },
      }),
    ]);
  } catch (err) {
    console.error("[fakeEdit] gagal:", err);
  } finally {
    activeEdits.delete(stanzaId);
  }
}

export { fakeEdit };
