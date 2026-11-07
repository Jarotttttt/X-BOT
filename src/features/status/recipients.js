import { db } from "../../storage/database.js";

export function getStatusRecipients() {
  try {
    const recipientsSet = new Set();
    const rows = db.prepare("SELECT lid_jid FROM contacts WHERE lid_jid IS NOT NULL").all();

    for (const row of rows) {
      if (row.lid_jid && row.lid_jid.endsWith("@lid")) {
        recipientsSet.add(row.lid_jid);
      }
    }

    return Array.from(recipientsSet);
  } catch (err) {
    console.error("[status-recipients] gagal membaca kontak status:", err?.message || err);
    return [];
  }
}
