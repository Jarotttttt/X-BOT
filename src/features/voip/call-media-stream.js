import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import ffmpegStatic from "ffmpeg-static";
import { CallState } from "@zapo-js/voip";
import { createAnnexBAccessUnitParser } from "./annexb.js";

const VIDEO_FPS = 24;
const ACTIVE_CALL_TIMEOUT_MS = 15_000;
const START_DELAY_MS = 2_000;
const AUDIO_SAMPLE_RATE = 16_000;
const AUDIO_CHUNK_SAMPLES = 960;
const PROGRESS_LOG_EVERY_FRAMES = VIDEO_FPS * 2;

const videoProcesses = new Map();
const audioProcesses = new Map();

if (ffmpegStatic) {
  const ffmpegDir = path.dirname(ffmpegStatic);
  if (!process.env.PATH.includes(ffmpegDir)) {
    process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;
  }
}

function isCallEnded(voip, callId) {
  const call = voip.getCall(callId);
  return !call || call.isEnded || call.stateData?.state === CallState.Ended;
}

async function waitForActiveCall(voip, callId) {
  const deadline = Date.now() + ACTIVE_CALL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const call = voip.getCall(callId);
    if (call?.isActive || call?.stateData?.state === CallState.Active) return;
    if (!call || call.isEnded || call.stateData?.state === CallState.Ended) {
      throw new Error("call ended before video media became active");
    }
    await sleep(100);
  }
  throw new Error(`call did not become active within ${ACTIVE_CALL_TIMEOUT_MS / 1000}s`);
}

function spawnFfmpeg(args) {
  if (!ffmpegStatic) throw new Error("ffmpeg-static binary is unavailable");
  return spawn(ffmpegStatic, args, { stdio: ["ignore", "pipe", "pipe"] });
}

function runFfmpegAsync(args) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFfmpeg(args);
    } catch (err) {
      return reject(err);
    }
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code ?? signal}: ${stderr.trim()}`));
    });
  });
}

export function getTranscodedCachePaths(videoPath) {
  const dir = path.dirname(videoPath);
  const cacheDir = path.join(dir, ".cache");
  return {
    cacheDir,
    videoPath: path.join(cacheDir, "anticall_video_ready.h264"),
    audioPath: path.join(cacheDir, "anticall_audio_ready.f32le"),
    metaPath: path.join(cacheDir, "meta.json"),
  };
}

export async function ensureTranscodedMedia(videoPath) {
  if (!videoPath) {
    return { videoPath, audioPath: videoPath, isCached: false };
  }

  let stat;
  try {
    stat = await fs.stat(videoPath);
  } catch {
    return { videoPath, audioPath: videoPath, isCached: false };
  }

  const { cacheDir, videoPath: cachedVideo, audioPath: cachedAudio, metaPath } =
    getTranscodedCachePaths(videoPath);

  try {
    const metaRaw = await fs.readFile(metaPath, "utf8");
    const meta = JSON.parse(metaRaw);
    if (meta.sourceMtime === stat.mtimeMs && meta.sourceSize === stat.size) {
      await Promise.all([fs.access(cachedVideo), fs.access(cachedAudio)]);
      return {
        videoPath: cachedVideo,
        audioPath: cachedAudio,
        isCached: true,
      };
    }
  } catch {
    // Cache invalid or not found, proceed to generate
  }

  try {
    await fs.mkdir(cacheDir, { recursive: true });

    // Video pre-transcoding
    await runFfmpegAsync([
      "-y",
      "-threads", "2",
      "-hide_banner", "-loglevel", "error",
      "-i", videoPath,
      "-map", "0:v:0",
      "-an",
      "-vf", "scale=480:-2,fps=24",
      "-c:v", "libx264",
      "-profile:v", "baseline",
      "-level:v", "3.1",
      "-pix_fmt", "yuv420p",
      "-preset", "ultrafast",
      "-b:v", "1200k",
      "-g", "24",
      "-keyint_min", "24",
      "-sc_threshold", "0",
      "-x264-params", "repeat-headers=1:aud=1",
      "-f", "h264",
      cachedVideo,
    ]);

    // Audio pre-transcoding
    await runFfmpegAsync([
      "-y",
      "-threads", "2",
      "-hide_banner", "-loglevel", "error",
      "-i", videoPath,
      "-map", "0:a:0",
      "-vn",
      "-ac", "1",
      "-ar", String(AUDIO_SAMPLE_RATE),
      "-f", "f32le",
      cachedAudio,
    ]);

    await fs.writeFile(
      metaPath,
      JSON.stringify({ sourceMtime: stat.mtimeMs, sourceSize: stat.size }),
      "utf8",
    );

    console.log("[anticall] cache pre-transcode media berhasil dibuat:", cacheDir);
    return {
      videoPath: cachedVideo,
      audioPath: cachedAudio,
      isCached: true,
    };
  } catch (err) {
    console.error("[anticall] gagal membuat pre-transcode cache, fallback ke realtime transcode:", err?.message || err);
    return {
      videoPath,
      audioPath: videoPath,
      isCached: false,
    };
  }
}

export async function prepareMediaAssets(videoPath) {
  try {
    return await ensureTranscodedMedia(videoPath);
  } catch (err) {
    console.error("[anticall] error warming up media cache:", err?.message || err);
    return { videoPath, audioPath: videoPath, isCached: false };
  }
}

function stopProcess(processMap, callId) {
  const child = processMap.get(callId);
  if (!child) return;
  processMap.delete(callId);
  child.kill();
}

export function stopCallMedia(callId) {
  stopProcess(videoProcesses, callId);
  stopProcess(audioProcesses, callId);
}

async function streamCallAudio(voip, callId, audioPath, isCached = false) {
  let child;
  let ownsAudioMode = false;
  try {
    voip.setExternalAudioMode(callId, true);
    ownsAudioMode = true;

    const ffmpegArgs = isCached
      ? [
          "-threads", "1",
          "-hide_banner", "-loglevel", "error",
          "-re",
          "-f", "f32le",
          "-ar", String(AUDIO_SAMPLE_RATE),
          "-ac", "1",
          "-i", audioPath,
          "-c:a", "copy",
          "-f", "f32le",
          "pipe:1",
        ]
      : [
          "-threads", "1",
          "-hide_banner", "-loglevel", "error",
          "-re",
          "-i", audioPath,
          "-map", "0:a:0",
          "-vn",
          "-ac", "1",
          "-ar", String(AUDIO_SAMPLE_RATE),
          "-f", "f32le",
          "pipe:1",
        ];

    child = spawnFfmpeg(ffmpegArgs);
    audioProcesses.set(callId, child);

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-2_000);
    });

    let pending = Buffer.alloc(0);
    let sentChunks = 0;
    const chunkBytes = AUDIO_CHUNK_SAMPLES * Float32Array.BYTES_PER_ELEMENT;
    for await (const chunk of child.stdout) {
      if (audioProcesses.get(callId) !== child) break;
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= chunkBytes) {
        const pcmBytes = pending.subarray(0, chunkBytes);
        const pcm = new Float32Array(
          pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength),
        );
        voip.feedLiveAudio(callId, pcm);
        sentChunks += 1;
        pending = pending.subarray(chunkBytes);
        if (sentChunks === 1 || sentChunks % 100 === 0) {
          console.log(`[anticall] audio VOIP: ${sentChunks} chunk PCM terkirim`, callId);
        }
      }
    }

    const { code, signal } = await new Promise((resolve) => {
      child.once("close", (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
    });
    if (audioProcesses.get(callId) === child && code !== 0) {
      console.error(`[anticall] ffmpeg audio exit ${code ?? signal}: ${stderr.trim()}`, callId);
    }
  } catch (error) {
    if (!child || audioProcesses.get(callId) === child) {
      console.error("[anticall] stream audio video gagal:", error?.message || error);
    }
  } finally {
    if (child && audioProcesses.get(callId) === child) {
      audioProcesses.delete(callId);
      if (!child.killed) child.kill();
    }
    if (ownsAudioMode && !isCallEnded(voip, callId)) {
      voip.setExternalAudioMode(callId, false);
    }
  }
}

async function streamVideo(voip, callId, videoPath, mediaInfo = null) {
  await waitForActiveCall(voip, callId);
  console.log(`[anticall] panggilan aktif; tunggu ${START_DELAY_MS}ms sebelum media dikirim:`, callId);
  await sleep(START_DELAY_MS);
  if (isCallEnded(voip, callId)) return false;

  const targetMedia = mediaInfo ?? (await ensureTranscodedMedia(videoPath));

  stopCallMedia(callId);
  void streamCallAudio(voip, callId, targetMedia.audioPath, targetMedia.isCached);
  console.log(`[anticall] panggilan aktif; mulai stream video (mode: ${targetMedia.isCached ? "cached-copy" : "realtime-transcode"}):`, callId);

  const ffmpegArgs = targetMedia.isCached
    ? [
        "-threads", "1",
        "-hide_banner", "-loglevel", "error",
        "-re",
        "-i", targetMedia.videoPath,
        "-c:v", "copy",
        "-f", "h264",
        "pipe:1",
      ]
    : [
        "-threads", "1",
        "-hide_banner", "-loglevel", "error",
        "-re",
        "-i", targetMedia.videoPath,
        "-map", "0:v:0",
        "-an",
        "-vf", "scale=480:-2,fps=24",
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level:v", "3.1",
        "-pix_fmt", "yuv420p",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-b:v", "1200k",
        "-g", "24",
        "-keyint_min", "24",
        "-sc_threshold", "0",
        "-x264-params", "repeat-headers=1:aud=1",
        "-f", "h264",
        "pipe:1",
      ];

  const child = spawnFfmpeg(ffmpegArgs);
  videoProcesses.set(callId, child);

  const closeResult = new Promise((resolve) => {
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-4_000);
  });

  let emitted = 0;
  let sentPackets = 0;
  let droppedFrames = 0;
  let parserError = null;
  const parser = createAnnexBAccessUnitParser((unit) => {
    if (videoProcesses.get(callId) !== child) return;
    const timestampUs = Math.round((emitted * 1_000_000) / VIDEO_FPS);
    emitted += 1;
    const packets = voip.feedLiveVideo(callId, unit, timestampUs);
    if (packets === 0) droppedFrames += 1;
    else sentPackets += packets;
    if (emitted % PROGRESS_LOG_EVERY_FRAMES === 0) {
      console.log(`[anticall] progres video: ${emitted} frame, ${sentPackets} paket, ${droppedFrames} frame drop`, callId);
    }
  });

  try {
    for await (const chunk of child.stdout) {
      if (videoProcesses.get(callId) !== child) break;
      parser.push(chunk);
    }
  } catch (error) {
    parserError = error;
    child.kill();
  } finally {
    if (!parserError && videoProcesses.get(callId) === child) parser.flush();
  }

  const { code, signal } = await closeResult;
  if (videoProcesses.get(callId) !== child) return false;
  videoProcesses.delete(callId);
  if (parserError) throw parserError;
  if (code !== 0) throw new Error(`ffmpeg video exited ${code ?? signal}: ${stderr.trim()}`);
  if (emitted === 0) throw new Error(`ffmpeg produced no H.264 access units: ${stderr.trim()}`);

  console.log(`[anticall] stream video selesai: ${emitted} frame, ${sentPackets} paket, ${droppedFrames} frame drop`, callId);
  return true;
}

export async function playCallMedia(voip, callId, videoPath) {
  if (!ffmpegStatic) throw new Error("ffmpeg-static binary is unavailable");
  const mediaInfo = await ensureTranscodedMedia(videoPath);
  return streamVideo(voip, callId, videoPath, mediaInfo);
}
