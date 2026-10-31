import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { CallState, WA_VIDEO_STATE } from "@zapo-js/voip";
import { playCallMedia, stopCallMedia, prepareMediaAssets } from "./call-media-stream.js";
import { shouldLoadIncomingCallAudio } from "./media-policy.js";
import { formatContact, saveOrUpdateContact } from "../../storage/contacts.js";

const audioFile = path.resolve(import.meta.dirname, "../../../assets/anticall.mp3");
const videoFile = path.resolve(import.meta.dirname, "../../../assets/anticall_video.mp4");
const videoCalls = new Set();

export const CALL_COOLDOWN_MS = 10_000;
export const callerCooldowns = new Map();

export function isCallerRateLimited(peerJid, now = Date.now()) {
  if (!peerJid) return false;
  for (const [jid, timestamp] of callerCooldowns.entries()) {
    if (now - timestamp > CALL_COOLDOWN_MS * 2) {
      callerCooldowns.delete(jid);
    }
  }

  const lastTime = callerCooldowns.get(peerJid);
  if (lastTime && now - lastTime < CALL_COOLDOWN_MS) {
    return true;
  }
  callerCooldowns.set(peerJid, now);
  return false;
}

async function playVideo(voip, callId) {
  try {
    const clipCompleted = await playCallMedia(voip, callId, videoFile);
    const call = voip.getCall(callId);
    if (clipCompleted && call && !call.isEnded) {
      console.log("[anticall] klip video selesai; mengakhiri panggilan:", callId);
      await voip.endCall(callId);
    }
  } catch (error) {
    console.error("[anticall] video stream gagal:", error?.message || error);
  }
}

export function bindVoipEvents(sock) {
  // Pre-transcode video & audio assets asynchronously so cache is ready
  void prepareMediaAssets(videoFile);

  sock.on("voip_call_incoming", async (call) => {
    try {
      if (call.peerJid && call.peerJidAlt) {
        const isLid = call.peerJid.endsWith("@lid");
        saveOrUpdateContact({
          lidJid: isLid ? call.peerJid : call.peerJidAlt,
          pnJid: isLid ? call.peerJidAlt : call.peerJid,
        });
      }

      const callerLabel = formatContact(call.peerJid);
      console.log(
        "[anticall] panggilan masuk:",
        call.callId,
        "dari:", callerLabel,
        "media:", call.mediaType,
        "state:", call.stateData?.state,
        call.isGroupCall ? `(grup: ${call.groupJid || "multi-peer"})` : "(1:1)",
      );

      if (isCallerRateLimited(call.peerJid)) {
        console.warn(`[anticall] cooldown aktif: menolak spam panggilan dari ${callerLabel}`);
        if (sock.voip) {
          await sock.voip.rejectCall(call.callId);
        }
        return;
      }

      if (sock.voip) {
        if (call.mediaType === "video") videoCalls.add(call.callId);
        await sock.voip.acceptCall(call.callId);
        if (shouldLoadIncomingCallAudio(call)) {
          await sleep(1500);
          try {
            await sock.voip.loadAudio(call.callId, audioFile);
            console.log("[anticall] audio berhasil di-inject ke panggilan:", call.callId);
          } catch (err) {
            console.error("[anticall] loadAudio error:", err?.message || err);
          }
        }
        if (call.mediaType === "video") void playVideo(sock.voip, call.callId);
      }
    } catch (err) {
      console.error("[anticall] gagal accept panggilan:", err?.message || err);
    }
  });

  sock.on("voip_call_state", (call) => {
    if (call.stateData?.state === CallState.Active) {
      console.log("[anticall] panggilan VOIP aktif:", call.callId, "jenis:", call.mediaType);
    } else {
      console.log("[anticall] state panggilan:", call.callId, call.stateData?.state);
    }
  });

  sock.on("voip_call_error", (error) => {
    console.error("[anticall] VOIP error:", error?.message || error);
  });

  sock.on("voip_call_peer_video_state", async ({ call, change }) => {
    if (change.state !== WA_VIDEO_STATE.UpgradeRequestV2 || !sock.voip) return;
    try {
      videoCalls.add(call.callId);
      await sock.voip.acceptVideoUpgrade(call.callId);
      console.log("[anticall] upgrade ke video diterima:", call.callId);
      void playVideo(sock.voip, call.callId);
    } catch (err) {
      console.error("[anticall] gagal menerima upgrade video:", err?.message || err);
    }
  });

  sock.on("voip_call_ended", (call) => {
    console.warn(
      "[anticall] panggilan berakhir:",
      call.callId,
      "media:", call.mediaType,
      "reason:", call.stateData?.endReason,
      "durationSecs:", call.stateData?.durationSecs,
    );
    stopCallMedia(call.callId);
    videoCalls.delete(call.callId);
  });

  sock.on("voip_call_outbound_audio_finished", async (call) => {
    try {
      if (videoCalls.has(call.callId)) return;
      console.log("[anticall] audio selesai, mengakhiri panggilan:", call.callId);
      if (sock.voip) {
        await sock.voip.endCall(call.callId);
      }
    } catch (err) {
      console.error("[anticall] gagal end call:", err?.message || err);
    }
  });
}
