# X-BOT â€” Knowledge Base & Agent Memory

X-BOT is a high-performance WhatsApp moderation and VOIP automation bot built with Node.js 22+, `zapo-js`, `@zapo-js/voip`, and SQLite.

## Core Stack & Environment
- **Runtime**: Node.js >= 22 (ES modules `"type": "module"`)
- **Core Library**: `zapo-js` (^1.11.0)
- **VOIP Plugin**: `@zapo-js/voip` (^1.4.0) with `@roamhq/wrtc`, `libmlow-wasm-fork`, `ffmpeg-static`
- **Database**: `better-sqlite3` (WAL mode) and `@zapo-js/store-sqlite`
- **Image Processing**: `sharp` (JPEG compress for profile picture)
- **Entry Points**:
  - `main.js`: Compatibility bootstrapper
  - `src/app.js`: Main application lifecycle, socket connection, and event listeners
- **Environment Variables** (`.env`):
  - `BOT_NUMBER`: WhatsApp phone number for pairing (e.g. `628xxxxxxxxxx`)
  - `SESSION_ID`: Identifier for session state (e.g. `default`)
  - `ICEL_DATA_DIR` *(optional)*: Path to data directory (defaults to `./data`)

## Architecture & Data Flow
```text
.
â”œâ”€â”€ assets/
â”‚   â”œâ”€â”€ .cache/                   # Pre-transcoded H.264 (.h264) + PCM (.f32le) â€” auto-generated on startup
â”‚   â”œâ”€â”€ anticall.mp3              # Audio payload for audio-only incoming calls
â”‚   â””â”€â”€ anticall_video.mp4        # Video payload for incoming video calls & upgrades
â”œâ”€â”€ data/                         # Local database files (ignored in git)
â”‚   â”œâ”€â”€ auth.db                   # Zapo-js auth/crypto credentials & session state
â”‚   â””â”€â”€ database.db               # Application database (better-sqlite3)
â”œâ”€â”€ patch.js                      # Postinstall monkey-patcher for zapo-js customNodes & album collection
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app.js                    # WaClient setup, pairing, reconnect loop, shutdown, debug_client_error listener
â”‚   â”œâ”€â”€ config.js                 # Environment validation and store provider configuration
â”‚   â”œâ”€â”€ handlers/
â”‚   â”‚   â”œâ”€â”€ message-handler.js    # Thin router: dedup, isMuted guard, dispatches to reaction handlers
â”‚   â”‚   â””â”€â”€ command-handler.js    # Text command router (prefix "!"), dispatches to command handlers
â”‚   â”œâ”€â”€ features/
â”‚   â”‚   â”œâ”€â”€ moderation/
â”‚   â”‚   â”‚   â”œâ”€â”€ silent-delete.js  # ProtocolMessage type 14 + status message silent revocation
â”‚   â”‚   â”‚   â””â”€â”€ fake-edit.js      # ProtocolMessage type 14 forced text override
â”‚   â”‚   â”œâ”€â”€ reactions/
â”‚   â”‚   â”‚   â”œâ”€â”€ delete.js         # ðŸ‘¾ Silent delete reaction handler
â”‚   â”‚   â”‚   â”œâ”€â”€ mute.js           # ðŸ¤« Toggle mute + isMuted helper (LID-aware)
â”‚   â”‚   â”‚   â”œâ”€â”€ fake-text.js      # ðŸ‘ Save fake text + â¤ï¸ fake edit reaction handlers
â”‚   â”‚   â”‚   â”œâ”€â”€ notify.js         # ðŸ’š Session transparency notify reaction handler
â”‚   â”‚   â”‚   â””â”€â”€ sticker.js        # â­ Save custom sticker + ðŸ—¿ sticker annotation spam
â”‚   â”‚   â”œâ”€â”€ commands/
â”‚   â”‚   â”‚   â”œâ”€â”€ add-ai.js         # !addai â€” tambah Meta AI ke grup
â”‚   â”‚   â”‚   â””â”€â”€ set-pp.js         # !setpp â€” ganti foto profil bot (reply/caption/URL)
â”‚   â”‚   â””â”€â”€ voip/
â”‚   â”‚       â”œâ”€â”€ anti-call.js      # Incoming call handling (audio/video/upgrade)
â”‚   â”‚       â”œâ”€â”€ call-media-stream.js # Ffmpeg pipeline feeding live video & PCM audio
â”‚   â”‚       â”œâ”€â”€ annexb.js         # H.264 Annex-B parser grouping NAL units by AUD
â”‚   â”‚       â””â”€â”€ media-policy.js   # Determines if audio injection applies
â”‚   â”œâ”€â”€ shared/
â”‚   â”‚   â””â”€â”€ utils.js              # JID normalization (null-safe), isSelf checker, unwrapAll, serializers
â”‚   â””â”€â”€ storage/
â”‚       â”œâ”€â”€ database.js           # SQLite tables (STRICT), PRAGMA tuning, prepared statements
â”‚       â”œâ”€â”€ message-store.js      # Message buffer with in-memory LRU cache and 3-day retention
â”‚       â”œâ”€â”€ contacts.js           # LID-to-phone contact tracking, resolution & formatting
â”‚       â””â”€â”€ lru.js                # Fast in-memory LRU cache
â””â”€â”€ tests/                        # Node.js native test runner suites
    â”œâ”€â”€ contacts.test.js
    â”œâ”€â”€ lru-cache.test.js
    â”œâ”€â”€ setup.js
    â”œâ”€â”€ voip-annexb.test.js
    â”œâ”€â”€ voip-anti-call.test.js
    â”œâ”€â”€ voip-call-media-stream.test.js
    â””â”€â”€ voip-media-policy.test.js
```

## Database Schema (`data/database.db`)
- `messages`: Stores incoming messages (excluding stubs/reactions) for up to 3 days (`RETENTION_MS = 3 days`). Indexed on `key_id` and `timestamp`.
- `contacts`: Stores mappings between WhatsApp LIDs (`lid_jid`), Phone numbers (`pn_jid`), and `push_name`.
- `muted`: Stores JIDs of participants muted via reaction (`jid TEXT PRIMARY KEY`).
- `fake_text`: Single-row table (`id = 1`) storing the custom fake edit template text.
- `annotation_sticker`: Single-row table (`id = 1`) storing raw serialized sticker message for annotation spam.

## Moderation Reaction Triggers
Triggered exclusively by reactions from the bot account (`isSelf(key, sock)`):
- ðŸ‘¾ : **Silent Delete** â€” [`reactions/delete.js`] Deletes the target message in a group silently using status message manipulation and immediate revocation.
- ðŸ¤« : **Toggle Mute** â€” [`reactions/mute.js`] Adds/removes target participant to `muted` table (resolves both LID and phone number). Deletes target message and subsequent messages.
- ðŸ‘ : **Save Fake Text** â€” [`reactions/fake-text.js`] Fetches target message text from `messageStore` and saves it to `fake_text` as the template.
- â¤ï¸ / â¤ : **Fake Edit** â€” [`reactions/fake-text.js`] Edits target message to the saved `fake_text` (or fallback `"HIDUP JOKOWI!"`).
- ðŸ’š : **Notify Reaction** â€” [`reactions/notify.js`] Fires 5 rapid reactions with `sessionTransparencyMetadata`.
- â­ / â­ï¸ : **Save Custom Sticker** â€” [`reactions/sticker.js`] Saves target message's sticker into `annotation_sticker`.
- ðŸ—¿ : **Sticker Annotation Spam** â€” [`reactions/sticker.js`] Dispatches 20 sticker messages linked to the target message via `associationType: 11` (parentMessageKey) at 200ms intervals.

## Text Command System
Triggered exclusively by messages from the bot account (`isSelf(key, sock)`). Prefix: `!`.
Router: `src/handlers/command-handler.js`. Tambah command baru: buat file di `src/features/commands/`, tambah `case` di router.

- `!addai` : **Add Meta AI** â€” [`commands/add-ai.js`] Tambah Meta AI (`867051314767696@bot`) ke grup. Hanya di grup.
- `!setpp` : **Set Profile Picture** â€” [`commands/set-pp.js`] Ganti foto profil bot. Sumber gambar: reply gambar / kirim gambar dengan caption / URL. Compress ke JPEG 720Ã—720 via `sharp` sebelum upload.

**API zapo-js penting untuk commands:**
- `sock.message.send(jid, { type: 'text', text })` â€” kirim pesan teks
- `sock.message.downloadBytes(event.message)` â€” download media dari message object (bukan event wrapper)
- `sock.message.downloadBytes(quotedMessage)` â€” download media dari quoted message
- `sock.group.addParticipants(groupJid, [jid])` â€” tambah participant ke grup
- `sock.profile.setProfilePicture(buffer)` â€” set foto profil bot

## VOIP Anti-Call Mechanics
- Single concurrent call policy (`maxConcurrentCalls: 1`).
- **Caller Anti-Spam Cooldown**: Throttles rapid repeat calls from the same JID (`CALL_COOLDOWN_MS = 10_000`), rejecting spam calls before initiating media pipelines.
- **Auto Pre-Transcoding Cache (`assets/.cache`)**: On startup or file change, generates pre-transcoded Baseline H.264 video (`.h264`) and 16kHz mono Float32 audio (`.f32le`). Real-time playback runs via FFmpeg in stream passthrough mode (`-c:v copy` and `-c:a copy` with `-threads 1`), dropping runtime CPU usage from ~90% to < 2% while preserving WebRTC timing. Falls back gracefully to dynamic transcode if cache generation fails.
- **Audio Calls**: Accepted -> 1.5s delay -> injects `assets/anticall.mp3` -> ends call when outbound audio finishes.
- **Video Calls**: Accepted -> waits for active state (2s delay) -> streams cached video/audio -> ends call upon clip completion. MP3 is NEVER loaded for video calls.
- **Upgrade Requests (`UpgradeRequestV2`)**: Automatically accepted, immediately triggers video/audio stream.

## patch.js â€” Postinstall Patcher
Runs automatically via `npm run postinstall`. Applies two patches to `zapo-js` internals:
- **Custom Node Override**: Replaces duplicate XML stanza tags instead of pushing them (prevents server rejection of malformed stanzas).
- **Album Collection Support**: Adds `WA_ENC_MEDIA_TYPES.COLLECTION = 'collection'` so `albumMessage` is encoded correctly.

## Contact Resolution (LID â†” Phone Number)
Every incoming message and VOIP call captures the sender's identity pair (`lid_jid` â†” `pn_jid`) via `extractIdentityPair()` and persists it to the `contacts` table. This enables:
- Mute checks that work regardless of whether WA delivers the message via LID or phone JID.
- Anti-call logs showing human-readable `+628xxx (Name)` instead of raw LID strings.

## Known Issues & Fixes
- **`toUserJid` null guard** (`src/shared/utils.js`): WA server occasionally delivers messages where `key.participant` and `key.remoteJid` are both `undefined` (e.g. system/protocol messages). Without a guard, this propagates into `zapo-js`'s `jid.indexOf('@')` and throws `TypeError`. Fixed by returning `null` early if the input is not a valid JID string containing `@`.
- **`debug_client_error` listener** (`src/app.js`): Listens to zapo-js's internal `debug_client_error` event to capture full stack traces from decode errors â€” previously these were swallowed by Pino with only `message` field logged (no stack).
- **`downloadBytes` source** (`src/features/commands/set-pp.js`): `sock.message.downloadBytes()` expects a **message object** (`event.message` or `quotedMessage`), NOT the full event wrapper. Passing the full event causes `message has no downloadable media` error.

## Verification & Development Commands
- `npm start` -> Start bot via `main.js`
- `npm run lint` -> Run ESLint
- `npm test` -> Run Node.js native tests (`node --import=./tests/setup.js --test`)
- `node patch.js` -> Manually re-apply zapo-js patches (runs automatically on `npm install`)
