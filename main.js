import fs from "node:fs/promises";
import path from "node:path";

import { createPinoLogger, WaClient } from "zapo-js";
import { WebSocket } from "ws";

import cfg from "./config.js";

import { messageStore } from "./src/store.js";
import { handleMessage, handleAddon } from "./handler.js";

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

function handleStoreEvent(sock, event, handler) {
  messageStore.insert(event);
  void handler(event, sock);
}

function bindStoreEvents(sock) {
  sock.on("message", (event) => handleStoreEvent(sock, event, handleMessage));
  sock.on("message_addon", (event) =>
    handleStoreEvent(sock, event, handleAddon),
  );
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
    const code = await sock.auth.requestPairingCode(
      cfg.botNumber,
      true,
      cfg.pairingCode,
    );

    console.log(`pairing code: ${code.match(/.{1,4}/g).join("-")}`);
  } catch (err) {
    pairingRequested = false;
    console.error("[bot] pairing failed:", err);
  }
}

function bindConnectionEvents(sock) {
  sock.on("connection", (event) => {
    if (event.status === "open") {
      console.log("bot connected");

      return;
    }

    if (event.isLogout) {
      void fs.rm(cfg.path.authState, {
        recursive: true,
        force: true,
      });

      console.log("logged out");
      return;
    }

    console.log("reconnecting...");

    setTimeout(() => {
      void sock.connect().catch((err) => {
        console.error("[bot] reconnect failed:", err);
      });
    }, 3000);
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
    },
    logger,
  );

  bindAuthEvents(sock);
  bindConnectionEvents(sock);
  bindStoreEvents(sock);

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
