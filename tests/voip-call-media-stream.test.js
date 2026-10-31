import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import {
  getTranscodedCachePaths,
  ensureTranscodedMedia,
} from "../src/features/voip/call-media-stream.js";

const sampleVideo = path.resolve(import.meta.dirname, "../assets/anticall_video.mp4");

test("getTranscodedCachePaths returns expected file paths inside .cache", () => {
  const cache = getTranscodedCachePaths(sampleVideo);
  assert.ok(cache.cacheDir.endsWith(path.join("assets", ".cache")));
  assert.ok(cache.videoPath.endsWith(".h264"));
  assert.ok(cache.audioPath.endsWith(".f32le"));
  assert.ok(cache.metaPath.endsWith("meta.json"));
});

test("ensureTranscodedMedia produces cached files and metadata", async () => {
  const result = await ensureTranscodedMedia(sampleVideo);
  assert.equal(result.isCached, true);

  const videoStat = await fs.stat(result.videoPath);
  assert.ok(videoStat.size > 0);

  const audioStat = await fs.stat(result.audioPath);
  assert.ok(audioStat.size > 0);

  // Calling it again should reuse the cache immediately
  const cachedAgain = await ensureTranscodedMedia(sampleVideo);
  assert.equal(cachedAgain.isCached, true);
  assert.equal(cachedAgain.videoPath, result.videoPath);
  assert.equal(cachedAgain.audioPath, result.audioPath);
});

test("ensureTranscodedMedia falls back gracefully for nonexistent input", async () => {
  const fakePath = path.resolve(import.meta.dirname, "../assets/nonexistent_file.mp4");
  const result = await ensureTranscodedMedia(fakePath);
  assert.equal(result.isCached, false);
  assert.equal(result.videoPath, fakePath);
  assert.equal(result.audioPath, fakePath);
});
