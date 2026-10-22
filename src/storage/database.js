import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";

import cfg from "../config.js";

mkdirSync(path.dirname(cfg.path.database), {
  recursive: true,
});

const db = new Database(cfg.path.database, { timeout: 5000 });

db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;
    PRAGMA journal_size_limit = 67108864;
    PRAGMA mmap_size = 268435456;
    PRAGMA cache_size = -32000;
    PRAGMA temp_store = MEMORY;

     CREATE TABLE IF NOT EXISTS fake_text (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         text TEXT NOT NULL
     ) STRICT;

     CREATE TABLE IF NOT EXISTS muted (
         jid TEXT NOT NULL PRIMARY KEY,
         updated_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
     ) STRICT;

      CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY,
         remote_jid TEXT NOT NULL,
         key_id TEXT NOT NULL,
         timestamp INTEGER,
         raw BLOB NOT NULL,
         UNIQUE (remote_jid, key_id)
     ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_messages_key ON messages(key_id);
      CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(timestamp);

      CREATE TABLE IF NOT EXISTS ai_chat_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          jid TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch('now'))
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ai_history_jid ON ai_chat_history(jid);
`);

const stmt = {
  muted: {
    get: db.prepare(`
            SELECT jid
            FROM muted
            WHERE jid = :jid
        `),

    insert: db.prepare(`
            INSERT OR IGNORE INTO muted (jid)
            VALUES (:jid)
        `),

    delete: db.prepare(`
            DELETE FROM muted
            WHERE jid = :jid
        `),
  },

  messages: {
    upsert: db.prepare(`
            INSERT INTO messages (
                remote_jid,
                key_id,
                timestamp,
                raw
            )
            VALUES (
                :remoteJid,
                :keyId,
                :timestamp,
                :raw
            )
            ON CONFLICT (remote_jid, key_id) DO UPDATE SET
                raw = excluded.raw,
                timestamp = COALESCE(excluded.timestamp, timestamp)
        `),

    getByKeyId: db.prepare(`
            SELECT *
            FROM messages
            WHERE key_id = :keyId
            ORDER BY timestamp DESC
            LIMIT 1
        `),

    count: db.prepare(`
            SELECT COUNT(*) AS count
            FROM messages
        `),

    pruneOld: db.prepare(`
            DELETE FROM messages
            WHERE timestamp < :threshold
        `),
  },

  fakeText: {
    get: db.prepare(`
            SELECT text
            FROM fake_text
            WHERE id = 1
        `),

    set: db.prepare(`
            INSERT INTO fake_text (id, text)
            VALUES (1, :text)
            ON CONFLICT (id) DO UPDATE SET text = excluded.text
        `),
  },

  aiHistory: {
    insert: db.prepare(`
            INSERT INTO ai_chat_history (jid, role, content)
            VALUES (:jid, :role, :content)
        `),

    getRecent: db.prepare(`
            SELECT role, content
            FROM (
                SELECT id, role, content
                FROM ai_chat_history
                WHERE jid = :jid
                ORDER BY id DESC
                LIMIT :limit
            )
            ORDER BY id ASC
        `),

    prune: db.prepare(`
            DELETE FROM ai_chat_history
            WHERE created_at < :threshold
        `),
  },
};

export { db, stmt };
