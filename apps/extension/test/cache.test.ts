import { describe, it, expect, beforeEach, vi } from "vitest";
import { createChunkCache } from "../src/cache.js";

/**
 * 缓存 seam：一个以文本+provider 维度做 key 的 KV，接口只有 get/set。
 * 它替掉「每次切分都重新请求」的行为；上层不需要知道存储细节。
 */

describe("chunk cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("同一 key 写入后能读回相同结果", () => {
    const cache = createChunkCache(localStorage);
    const chunks = [{ text: "Reading English", startOffset: 0, endOffset: 15 }];

    cache.set("key-a", chunks);

    expect(cache.get("key-a")).toEqual(chunks);
  });

  it("未写入的 key 返回 undefined（静默 miss）", () => {
    const cache = createChunkCache(localStorage);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("存储内容是损坏 JSON 时静默 miss，不抛错", () => {
    const cache = createChunkCache(localStorage);
    localStorage.setItem("chunkly.cache.corrupt", "{not json");

    expect(() => cache.get("corrupt")).not.toThrow();
    expect(cache.get("corrupt")).toBeUndefined();
  });

  it("超过容量上限时淘汰最旧的条目", () => {
    const cache = createChunkCache(localStorage, { maxEntries: 2 });

    cache.set("k1", [{ text: "a", startOffset: 0, endOffset: 1 }]);
    cache.set("k2", [{ text: "b", startOffset: 0, endOffset: 1 }]);
    cache.set("k3", [{ text: "c", startOffset: 0, endOffset: 1 }]);

    // k1 是最旧的，应被淘汰
    expect(cache.get("k1")).toBeUndefined();
    expect(cache.get("k3")).toEqual([{ text: "c", startOffset: 0, endOffset: 1 }]);
  });

  it("clear 清空所有条目", () => {
    const cache = createChunkCache(localStorage);
    cache.set("x", [{ text: "a", startOffset: 0, endOffset: 1 }]);
    cache.clear();
    expect(cache.get("x")).toBeUndefined();
  });
});
