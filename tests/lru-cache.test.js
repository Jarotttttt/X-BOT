import test from "node:test";
import assert from "node:assert/strict";
import { LRUCache } from "../src/storage/lru.js";

test("LRUCache stores, retrieves and evicts oldest entries", () => {
  const cache = new LRUCache(3);

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  assert.equal(cache.size, 3);
  assert.equal(cache.get("a"), 1); // "a" is now most recently used

  cache.set("d", 4); // should evict "b" (since "a" was accessed)
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.get("d"), 4);

  cache.delete("a");
  assert.equal(cache.has("a"), false);
  assert.equal(cache.size, 2);

  cache.clear();
  assert.equal(cache.size, 0);
});
