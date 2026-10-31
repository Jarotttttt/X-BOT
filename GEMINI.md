# X-BOT — Knowledge Base & Agent Memory

X-BOT is a high-performance WhatsApp moderation and VOIP automation bot built with Node.js 22+, `zapo-js`, `@zapo-js/voip`, and SQLite.

## Core Stack & Environment
- **Runtime**: Node.js >= 22 (ES modules `"type": "module"`)
- **Core Library**: `zapo-js` (^1.11.0)
- **VOIP Plugin**: `@zapo-js/voip` (^1.4.0) with `@roamhq/wrtc`, `libmlow-wasm-fork`, `ffmpeg-static`
- **Database**: `better-sqlite3` (WAL mode) and `@zapo-js/store-sqlite`
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
├── assets/
│   ├── anticall.mp3              # Audio payload for audio-only incoming calls
│   └── anticall_video.mp4        # Video payload for incoming video calls & upgrades
├── data/                         # Local database files (ignored in git)
│   ├── auth.db                   # Zapo-js auth/crypto credentials & session state
│   └── database.db               # Application database (better-sqlite3)
├── patch.js                      # Postinstall monkey-patcher for zapo-js customNodes & album collection
├── src/
│   ├── app.js                    # WaClient setup, pairing, reconnect loop, shutdown
│   ├── config.js                 # Environment validation and store provider configuration
│   ├── handlers/
│   │   └── message-handler.js    # Routes messages, reactions, moderation commands (.rvo)
│   ├── features/
│   │   ├── moderation/
│   │   │   ├── silent-delete.js  # ProtocolMessage type 14 + status message silent revocation
│   │   │   └── fake-edit.js      # ProtocolMessage type 14 forced text override
│   │   └── voip/
│   │       ├── anti-call.js      # Incoming call handling (audio/video/upgrade)
│   │       ├── call-media-stream.js # Ffmpeg pipeline feeding live video & PCM audio
│   │       ├── annexb.js         # H.264 Annex-B parser grouping NAL units by AUD
│   │       └── media-policy.js   # Determines if audio injection applies
│   ├── shared/
│   │   └── utils.js              # JID normalization, isSelf checker, unwrapAll, serializers
│   └── storage/
│       ├── database.js           # SQLite tables (STRICT), PRAGMA tuning, prepared statements
│       ├── message-store.js      # Message buffer with in-memory LRU cache and 3-day retention
│       ├── contacts.js           # LID-to-phone contact tracking, resolution & formatting
│       └── lru.js                # Fast in-memory LRU cache
└── tests/                        # Node.js native test runner suites
```

## Database Schema (`data/database.db`)
- `messages`: Stores incoming messages (excluding stubs/reactions) for up to 3 days (`RETENTION_MS = 3 days`). Indexed on `key_id` and `timestamp`.
- `contacts`: Stores mappings between WhatsApp LIDs (`lid_jid`), Phone numbers (`pn_jid`), and `push_name`.
- `muted`: Stores JIDs of participants muted via reaction (`jid TEXT PRIMARY KEY`).
- `fake_text`: Single-row table (`id = 1`) storing the custom fake edit template text.
- `annotation_sticker`: Single-row table (`id = 1`) storing raw serialized sticker message for annotation spam.

## Moderation Reaction Triggers & Commands
Triggered exclusively by reactions or messages from the bot account (`isSelf(key, sock)`):
- 👾 : **Silent Delete** — Deletes the target message in a group silently using status message manipulation and immediate revocation.
- 🤫 : **Toggle Mute** — Adds/removes target participant to `muted` table (resolves both LID and phone number). Deletes target message and subsequent messages.
- 👍 : **Save Fake Text** — Fetches target message text from `messageStore` and saves it to `fake_text` as the template.
- ❤️ / ❤ : **Fake Edit** — Edits target message to the saved `fake_text` (or fallback `"HIDUP JOKOWI!"`).
- 💚 : **Notify Reaction** — Fires 5 rapid reactions with `sessionTransparencyMetadata`.
- ⭐ / ⭐️ : **Save Custom Sticker** — Saves target message's sticker into `annotation_sticker`.
- 🗿 : **Sticker Annotation Spam** — Dispatches 20 sticker messages linked to the target message via `associationType: 11` (parentMessageKey) at 200ms intervals.
- `.rvo` / `!rvo` / `#rvo` *(Quoted Command)*: **Read View-Once** — Replies to a View-Once message and resends the media unconstrained without downloading or re-uploading buffer.

## VOIP Anti-Call Mechanics
- Single concurrent call policy (`maxConcurrentCalls: 1`).
- **Caller Anti-Spam Cooldown**: Throttles rapid repeat calls from the same JID (`CALL_COOLDOWN_MS = 10_000`), rejecting spam calls before initiating media pipelines.
- **Auto Pre-Transcoding Cache (`assets/.cache`)**: On startup or file change, generates pre-transcoded Baseline H.264 video (`.h264`) and 16kHz mono Float32 audio (`.f32le`). Real-time playback runs via FFmpeg in stream passthrough mode (`-c:v copy` and `-c:a copy` with `-threads 1`), dropping runtime CPU usage from ~90% to < 2% while preserving WebRTC timing. Falls back gracefully to dynamic transcode if cache generation fails.
- **Audio Calls**: Accepted -> 1.5s delay -> injects `assets/anticall.mp3` -> ends call when outbound audio finishes.
- **Video Calls**: Accepted -> waits for active state (2s delay) -> streams cached video/audio -> ends call upon clip completion. MP3 is NEVER loaded for video calls.
- **Upgrade Requests (`UpgradeRequestV2`)**: Automatically accepted, immediately triggers video/audio stream.

## Verification & Development Commands
- `npm start` -> Start bot via `main.js`
- `npm run lint` -> Run ESLint
- `npm test` -> Run Node.js native tests (`node --import=./tests/setup.js --test`)
