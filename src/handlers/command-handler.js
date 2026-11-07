import { isSelf } from "../shared/utils.js";
import { addAiCommand } from "../features/commands/add-ai.js";
import { setProfilePictureCommand } from "../features/commands/set-pp.js";
import { rvoCommand } from "../features/commands/rvo.js";
import { menuCommand } from "../features/commands/menu.js";
import { bussCommand } from "../features/commands/buss.js";
import { listBungkamCommand } from "../features/commands/list-bungkam.js";
import { prankCallCommand, setPrankAudio } from "../features/commands/prank-call.js";
import { statusCommand } from "../features/commands/sw.js";
import { swSpamCommand } from "../features/commands/sw-spam.js";

const PREFIX = "!";

function parseCommand(text) {
  if (!text || !text.startsWith(PREFIX)) return null;
  const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  return { command: cmd.toLowerCase(), args };
}

function extractText(message) {
  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    ""
  );
}

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
      case "menu":
      case "help":
        await menuCommand(sock, jid);
        break;
      case "addai":
        if (!jid.endsWith("@g.us")) return;
        await addAiCommand(sock, jid);
        break;
      case "setpp":
        await setProfilePictureCommand(sock, jid, event);
        break;
      case "rvo":
        await rvoCommand(sock, jid, event);
        break;
      case "sw":
      case "upsw":
      case "status":
        await statusCommand(sock, jid, event, args);
        break;
      case "swspam":
      case "spamsw":
        await swSpamCommand(sock, jid, args);
        break;
      case "buss":
      case "card":
        await bussCommand(sock, jid, event, args);
        break;
      case "listbungkam":
      case "listmute":
        await listBungkamCommand(sock, jid);
        break;
      case "prankcall":
      case "prank":
        await prankCallCommand(sock, jid, event, args);
        break;
      case "setprank":
      case "setsuara":
        await setPrankAudio(sock, jid, event);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[command-handler] error:", err?.message || err);
  }
}
