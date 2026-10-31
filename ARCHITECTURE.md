# X-BOT Architecture

X-BOT is a high-performance WhatsApp moderation and VOIP automation bot built with Node.js 22+, `zapo-js`, `@zapo-js/voip`, and SQLite.

## Project Layout

```text
.
├── assets/
│   ├── .cache/                   # Pre-transcoded H.264 (.h264) + PCM (.f32le)
│   ├── anticall.mp3              # Static payload for audio-only incoming calls
│   └── anticall_video.mp4        # Video payload for incoming video calls & upgrades
├── data/                         # Local SQLite databases (git-ignored)
│   ├── auth.db                   # WhatsApp auth credentials & session keys
│   └── database.db               # Application store (contacts, messages, muted, etc.)
├── patch.js                      # Postinstall monkey-patcher for zapo-js internals
├── src/
│   ├── app.js                    # Application entry, lifecycle, connection loop, event binding
│   ├── config.js                 # Environment validation & store provider setup
│   ├── handlers/
│   │   ├── message-handler.js    # Routing incoming messages and reaction moderation
│   │   └── command-handler.js    # Routing bot text commands (prefix "!")
│   ├── features/
│   │   ├── moderation/
│   │   │   ├── silent-delete.js  # ProtocolMessage type 14 + status message silent revocation
│   │   │   └── fake-edit.js      # ProtocolMessage type 14 forced text override
│   │   ├── reactions/
│   │   │   ├── delete.js         # 👾 Silent delete target message
│   │   │   ├── mute.js           # 🤫 Toggle mute target user (LID & PN aware)
│   │   │   ├── fake-text.js      # 👍 Save fake text & ❤️ execute fake edit
│   │   │   ├── notify.js         # 💚 Session transparency notify reaction
│   │   │   └── sticker.js        # ⭐ Save custom sticker & 🗿 sticker annotation spam
│   │   ├── commands/
│   │   │   ├── add-ai.js         # !addai — add Meta AI bot to group
│   │   │   ├── set-pp.js         # !setpp — set bot profile picture (reply, caption, URL)
│   │   │   └── rvo.js            # !rvo — reveal view-once media (all media formats)
│   │   └── voip/
│   │       ├── anti-call.js      # Incoming call handling (audio/video/upgrade)
│   │       ├── call-media-stream.js # FFmpeg pipeline feeding live video & PCM audio
│   │       ├── annexb.js         # H.264 Annex-B parser grouping NAL units by AUD
│   │       └── media-policy.js   # Determines if audio injection applies
│   ├── shared/
│   │   └── utils.js              # Null-safe JID normalization, isSelf checker, unwrapAll
│   └── storage/
│       ├── database.js           # SQLite tables (STRICT mode) & prepared statements
│       ├── message-store.js      # Target message persistence with LRU cache & 3-day retention
│       ├── contacts.js           # LID-to-Phone identity mapping & formatting
│       └── lru.js                # Fast in-memory LRU cache
├── tests/                        # Node.js native test runner suites
│   ├── contacts.test.js
│   ├── lru-cache.test.js
│   ├── setup.js
│   ├── voip-annexb.test.js
│   ├── voip-anti-call.test.js
│   ├── voip-call-media-stream.test.js
│   └── voip-media-policy.test.js
├── main.js                       # Compatibility bootstrapper
└── package.json
```

## Runtime Flow

1. **Bootstrapping**: `main.js` loads `src/app.js`. Configuration and storage engines are initialized.
2. **Client Startup**: `WaClient` connects to the WhatsApp WebSocket transport with `@zapo-js/voip` plugin enabled.
3. **Contact Tracking**: Every message and call event automatically resolves and updates the participant's LID ↔ Phone identity pair in `storage/contacts.js`.
4. **Message Routing**:
   - Inbound reactions from the bot account are routed by `src/handlers/message-handler.js` to specific action handlers in `src/features/reactions/`.
   - Text commands prefixed with `!` sent by the bot account are routed by `src/handlers/command-handler.js` to handlers in `src/features/commands/`.
   - Automated moderation checks (e.g. deleting messages from muted participants) happen transparently in `message-handler.js`.
5. **VOIP Handling**: Incoming calls trigger `src/features/voip/anti-call.js`, executing anti-spam throttling, audio injection, or pre-transcoded video playback via WebRTC media tracks.

## VOIP Pipeline Mechanics

- **Audio Calls**: Accepted -> 1.5s delay -> injects `assets/anticall.mp3` -> terminates call when playback ends.
- **Video Calls**: Accepted -> waits 2s for active stream -> plays pre-transcoded Baseline H.264 and Float32 PCM directly via FFmpeg stream passthrough mode (`-c:v copy`, `-c:a copy`), reducing CPU consumption to < 2%.
- **Upgrades**: Audio-to-video upgrade requests (`UpgradeRequestV2`) are automatically accepted and immediately switch to video streaming.

## Verification & Development

- `npm start` — Start the bot via `main.js`.
- `npm run lint` — Lint the codebase with ESLint.
- `npm test` — Run Node.js native test runner suites.
- `node patch.js` — Manually re-apply zapo-js patches (automatically executed via `npm install`).
