import { describe, it, expect, beforeEach, vi } from "vitest";
import { createChunkCache, buildCacheKey, type StorageLike } from "../src/cache.js";

/**
 * 行为层验证：缓存的意义是「同一段文本第二次切分不再打网络」。
 * 这里用真实的内存 Storage 替身，不 mock 内部模块。
 */

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  get length() { return this.map.size; }
}

/** 模拟一次切分调用：先查缓存，miss 才打网络 */
async function chunkWithCache(
  text: string,
  opts: { model: string; baseURL: string; effort?: string },
  cache: ReturnType<typeof createChunkCache>,
  fetcher: () => Promise<Array<{ text: string; startOffset: number; endOffset: number }>>
) {
  const key = buildCacheKey({ ...opts, reasoningEffort: opts.effort, text });
  const hit = cache.get(key);
  if (hit) return { chunks: hit, source: "cache" as const };

  const chunks = await fetcher();
  cache.set(key, chunks);
  return { chunks, source: "network" as const };
}

describe("切分结果缓存（行为）", () => {
  let storage: MemoryStorage;
  let cache: ReturnType<typeof createChunkCache>;

  beforeEach(() => {
    storage = new MemoryStorage();
    cache = createChunkCache(storage);
  });

  it("同一段文本第二次切分不再请求网络", async () => {
    const fetcher = vi.fn().mockResolvedValue([
      { text: "Reading English", startOffset: 0, endOffset: 15 },
    ]);
    const opts = { model: "deepseek/deepseek-v4.1-flash", baseURL: "https://api.commandcode.ai/provider/v1" };

    const first = await chunkWithCache("Reading English", opts, cache, fetcher);
    const second = await chunkWithCache("Reading English", opts, cache, fetcher);

    expect(first.source).toBe("network");
    expect(second.source).toBe("cache");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second.chunks).toEqual(first.chunks);
  });

  it("换模型后视为不同 key，会重新请求", async () => {
    const fetcher = vi.fn().mockResolvedValue([{ text: "abc", startOffset: 0, endOffset: 3 }]);
    const base = { baseURL: "https://api.commandcode.ai/provider/v1" };

    await chunkWithCache("abc", { ...base, model: "model-a" }, cache, fetcher);
    await chunkWithCache("abc", { ...base, model: "model-b" }, cache, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("换 reasoning effort 视为不同 key", async () => {
    const fetcher = vi.fn().mockResolvedValue([{ text: "abc", startOffset: 0, endOffset: 3 }]);
    const base = { baseURL: "https://api.commandcode.ai/provider/v1", model: "m" };

    await chunkWithCache("abc", { ...base, effort: "off" }, cache, fetcher);
    await chunkWithCache("abc", { ...base, effort: "high" }, cache, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("不同文本不会串味", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce([{ text: "aaa", startOffset: 0, endOffset: 3 }])
      .mockResolvedValueOnce([{ text: "bbb", startOffset: 0, endOffset: 3 }]);
    const opts = { model: "m", baseURL: "u" };

    const a = await chunkWithCache("aaa", opts, cache, fetcher);
    const b = await chunkWithCache("bbb", opts, cache, fetcher);

    expect(a.chunks[0].text).toBe("aaa");
    expect(b.chunks[0].text).toBe("bbb");
  });
});
