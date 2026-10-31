import { isSelf } from "../shared/utils.js";
import { addAiCommand } from "../features/commands/add-ai.js";
import { setProfilePictureCommand } from "../features/commands/set-pp.js";

const PREFIX = "!";

/**
 * Parse teks pesan jadi { command, args }.
 * Return null kalau bukan command (tidak diawali prefix).
 */
function parseCommand(text) {
  if (!text || !text.startsWith(PREFIX)) return null;
  const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  return { command: cmd.toLowerCase(), args };
}

/**
 * Ambil teks dari berbagai jenis message.
 */
function extractText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    ""
  );
}

/**
 * Router command teks. Hanya diproses jika dikirim oleh bot sendiri.
 * Command !addai hanya jalan di grup, yang lain bisa di mana saja.
 */
export async function handleCommand(event, sock) {
  try {
    const key = event?.key;
    const jid = key?.remoteJid;
    if (!jid || !isSelf(key, sock)) return;

    const text = extractText(event.message);
    const parsed = parseCommand(text);
    if (!parsed) return;

    const { command, args } = parsed;
    console.log("[command]", command, "in", jid);

    switch (command) {
      case "addai":
        if (!jid.endsWith("@g.us")) return;
        await addAiCommand(sock, jid);
        break;
      case "setpp":
        await setProfilePictureCommand(sock, jid, event, args);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[command-handler] error:", err?.message || err);
  }
}
