# X-BOT Architecture

X-BOT is a Node.js 22+ WhatsApp automation project using `zapo-js` and SQLite.
The existing reaction-driven moderation and call-handling behaviors are preserved.

## Project layout

```text
.
├── assets/                         # Static assets for call audio/video
├── backups/                        # Pre-change copies of core files
├── data/                            # Local SQLite/authentication state (do not commit)
├── src/
│   ├── app.js                       # Application startup and connection lifecycle
│   ├── config.js                    # Environment and persistent-store configuration
│   ├── handlers/
│   │   └── message-handler.js       # Message and reaction routing
│   ├── features/
│   │   ├── moderation/              # Existing reaction moderation protocols
│   │   ├── voip/anti-call.js        # Incoming-call VOIP audio/video streaming
│   │   └── voip/annexb.js           # H.264 Annex-B access-unit parser
│   ├── shared/utils.js              # Shared JID and message serialization helpers
│   └── storage/
│       ├── database.js              # SQLite schema and prepared queries
│       └── message-store.js          # Message persistence and retention
├── main.js                          # Compatibility entry point (`node main.js`)
└── package.json
```

## Runtime flow

`main.js` loads `src/app.js`. The app initializes config, the WhatsApp client, event handlers, message storage, and VOIP listeners. Incoming messages go through `handlers/message-handler.js`, which routes message reactions to moderation actions. Persistent app data is managed in `storage/`.

## Pairing and configuration

Phone-number pairing requests a WhatsApp-generated pairing code for `BOT_NUMBER`; there is no custom pairing-code configuration.


Incoming calls are handled only through the VOIP plugin; there is no voice-note or chat-media fallback. Only incoming audio calls load `assets/anticall.mp3`. Incoming video calls encode `assets/anticall_video.mp4` to H.264 Baseline and stream it with 16 kHz mono PCM audio through `feedLiveVideo` / `feedLiveAudio` once; MP3 is not used for video calls. An incoming 1:1 `UpgradeRequestV2` on an audio call is accepted, then the clip's video and audio streams start (audio already played before upgrade cannot be retracted). A successfully completed clip ends the call. Live WhatsApp negotiation and rendering must be tested separately; `feedLiveVideo` returning zero can mean media is inactive, held, remote-hosted, or waiting for an IDR key frame.

## Storage and safety notes

- `storage/database.js` creates required tables and indexes but does not drop legacy tables on startup. Schema cleanup requires an explicit migration and backup.
- `storage/message-store.js` prunes stored messages using a three-day retention threshold.

## Commands

- `npm start` — start the bot via the compatibility entry point.
- `npm run lint` — lint the project.
- `npm test` — run Node's test runner (tests should be added under `tests/`).
