import fs from "node:fs/promises";
import path from "node:path";
import { clearTimeout } from "node:timers";

import { createPinoLogger, WaClient } from "zapo-js";
import { voipPlugin } from "@zapo-js/voip";
import { WebSocket } from "ws";

import cfg from "./config.js";

import { messageStore } from "./storage/message-store.js";
import { handleMessage, handleAddon } from "./handlers/message-handler.js";
import { bindVoipEvents } from "./features/voip/anti-call.js";

process.on("uncaughtException", (err) => {
  console.error("[uncaught-exception]", err?.stack || err?.message || err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandled-rejection]", reason);
});

const logger = await createPinoLogger({ level: "error" });

globalThis.WebSocket = WebSocket;

await fs.mkdir(path.dirname(cfg.path.authState), {
  recursive: true,
});

function bindEvents(sock) {
  sock.on("message", (event) => {
    if (event?.key?.id && !event.message?.reactionMessage) {
      messageStore.insert(event);
    }
    void handleMessage(event, sock);
  });
  sock.on("message_addon", (event) => void handleAddon(event, sock));
  bindVoipEvents(sock);
}

let pairingRequested = false;

function bindAuthEvents(sock) {
  sock.on("auth_qr", () => {
    if (pairingRequested) return;

    pairingRequested = true;
    void requestPairingCode(sock);
  });

  sock.on("auth_paired", ({ credentials }) => {
    console.log("paired as", credentials.meJid);
  });
}

async function requestPairingCode(sock) {
  try {
    const code = await sock.auth.requestPairingCode(cfg.botNumber);

    console.log(`pairing code: ${code.match(/.{1,4}/g).join("-")}`);
  } catch (err) {
    pairingRequested = false;
    console.error("[bot] pairing failed:", err);
  }
}

function bindConnectionEvents(sock) {
  let reconnectTimer = null;
  let reconnectAttempt = 0;

  sock.on("connection", (event) => {
    if (event.status === "open") {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      reconnectAttempt = 0;
      console.log("bot connected");
      return;
    }

    if (event.isLogout) {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      void fs.rm(cfg.path.authState, {
        recursive: true,
        force: true,
      });

      console.log("logged out");
      return;
    }

    if (reconnectTimer) return;
    const delayMs = Math.min(3000 * 2 ** reconnectAttempt, 60_000);
    reconnectAttempt += 1;
    console.log(`reconnecting in ${Math.ceil(delayMs / 1000)}s...`);

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void sock.connect().catch((err) => {
        console.error("[bot] reconnect failed:", err);
      });
    }, delayMs);
  });
}

async function start() {
  const sock = new WaClient(
    {
      store: cfg.store,
      sessionId: cfg.sessionId,
      markOnlineOnConnect: true,
      history: {
        enabled: true,
        requireFullSync: false,
      },
      addons: {
        autoDecrypt: true,
        persistAllSecrets: true,
      },
      plugins: [voipPlugin({ maxConcurrentCalls: 1 })],
    },
    logger,
  );

  bindAuthEvents(sock);
  bindConnectionEvents(sock);
  bindEvents(sock);

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`shutting down (${signal})...`);

    try {
      await cfg.store.destroy();
    } catch (err) {
      console.error("[bot] store cleanup failed:", err);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await sock.connect();
}

await start();
