import { stmt } from "./database.js";
import { LRUCache } from "./lru.js";
import { toUserJid } from "../shared/utils.js";

const contactCache = new LRUCache(1000);

function cacheContact(row) {
  if (!row) return null;
  if (row.lid_jid) contactCache.set(row.lid_jid, row);
  if (row.pn_jid) contactCache.set(row.pn_jid, row);
  return row;
}

export function extractIdentityPair(key) {
  if (!key) return { lidJid: null, pnJid: null };

  const primary = toUserJid(key.participant ?? key.remoteJid);
  const alt = toUserJid(key.participantAlt ?? key.remoteJidAlt);

  if (!primary || !alt) return { lidJid: null, pnJid: null };

  const primaryIsLid = primary.endsWith("@lid");
  return {
    lidJid: primaryIsLid ? primary : alt,
    pnJid: primaryIsLid ? alt : primary,
  };
}

export function getContactByJid(jid) {
  if (!jid) return null;
  const normalized = toUserJid(jid);
  if (!normalized) return null;

  if (contactCache.has(normalized)) {
    return contactCache.get(normalized);
  }

  const row = normalized.endsWith("@lid")
    ? stmt.contacts.findByLid.get(normalized)
    : stmt.contacts.findByPn.get(normalized);

  return cacheContact(row ?? null);
}

export function saveOrUpdateContact({ lidJid, pnJid, pushName }) {
  if (!lidJid || !pnJid) return null;

  const normLid = toUserJid(lidJid);
  const normPn = toUserJid(pnJid);
  const cleanName = pushName?.trim() || null;
  const now = Math.floor(Date.now() / 1000);

  const existing = getContactByJid(normLid) ?? getContactByJid(normPn);

  if (!existing) {
    try {
      const info = stmt.contacts.insert.run(normLid, normPn, cleanName, now, now);
      return cacheContact({
        id: info.lastInsertRowid,
        lid_jid: normLid,
        pn_jid: normPn,
        push_name: cleanName,
        created_at: now,
        updated_at: now,
      });
    } catch {
      return null;
    }
  }

  if (cleanName && cleanName !== existing.push_name) {
    try {
      stmt.contacts.updateName.run(cleanName, now, existing.id);
      existing.push_name = cleanName;
      existing.updated_at = now;
      cacheContact(existing);
    } catch {
      // ignore concurrent update collision
    }
  }

  return existing;
}

export function formatContact(jid, fallbackName = null) {
  if (!jid) return "unknown";
  const norm = toUserJid(jid);
  const contact = getContactByJid(norm);

  if (contact) {
    const pn = contact.pn_jid?.replace(/@.*$/, "");
    const name = contact.push_name || fallbackName;
    if (pn && name) {
      return `+${pn} (${name})`;
    }
    if (pn) {
      return `+${pn}`;
    }
    if (name) {
      return `${name} (${norm})`;
    }
  }

  if (fallbackName) {
    return `${fallbackName} (${norm})`;
  }

  if (norm.endsWith("@s.whatsapp.net")) {
    return `+${norm.replace(/@.*$/, "")}`;
  }

  return norm;
}
