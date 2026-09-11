import { toUserJid as normalizeJid } from "zapo-js";

export function toTimestamp(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value);
}

export function isSelf(key, sock) {
  if (!key) return false;
  if (key.fromMe === true) return true;

  if (sock?.getCredentials) {
    const creds = sock.getCredentials();
    const meJid = creds?.meJid ? normalizeJid(creds.meJid) : null;
    const meLid = creds?.meLid ? normalizeJid(creds.meLid) : null;
    const mePn = meJid ? meJid.split("@")[0].split(":")[0] : null;

    const candidates = [
      key.participant ? normalizeJid(key.participant) : null,
      key.participantAlt ? normalizeJid(key.participantAlt) : null,
      key.remoteJid ? normalizeJid(key.remoteJid) : null,
      key.remoteJidAlt ? normalizeJid(key.remoteJidAlt) : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (meJid && candidate === meJid) return true;
      if (meLid && candidate === meLid) return true;
      if (mePn && candidate.split("@")[0].split(":")[0] === mePn) return true;
    }
  }

  return false;
}

export function toUserJid(jid) {
  return normalizeJid(jid);
}

export function serializeMessage(message) {
  if (!message) return null;
  return Buffer.from(
    JSON.stringify(message, (key, value) => {
      if (value instanceof Uint8Array) {
        return {
          __bytes: Buffer.from(value).toString("base64"),
        };
      }
      return value;
    }),
  );
}

export function deserializeMessage(raw) {
  return JSON.parse(raw.toString(), (key, value) => {
    if (
      value &&
      typeof value === "object" &&
      typeof value.__bytes === "string"
    ) {
      return new Uint8Array(Buffer.from(value.__bytes, "base64"));
    }

    return value;
  });
}
