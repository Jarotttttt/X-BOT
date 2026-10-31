import { isSelf } from "../shared/utils.js";
import { addAiCommand } from "../features/commands/add-ai.js";

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
 * Router command teks. Hanya diproses jika dikirim oleh bot sendiri
 * dan hanya di dalam grup.
 */
export async function handleCommand(event, sock) {
  try {
    const key = event?.key;
    const jid = key?.remoteJid;
    if (!jid || !jid.endsWith("@g.us")) return;
    if (!isSelf(key, sock)) return;

    const text =
      event.message?.conversation ||
      event.message?.extendedTextMessage?.text ||
      "";

    const parsed = parseCommand(text);
    if (!parsed) return;

    console.log("[command]", parsed.command, "in", jid);

    switch (parsed.command) {
      case "addai":
        await addAiCommand(sock, jid);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[command-handler] error:", err?.message || err);
  }
}
