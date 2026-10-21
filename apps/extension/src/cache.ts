/**
 * 切分结果缓存。
 *
 * 为什么值得做：阅读场景的重复率很高——翻页回来、重新选中同一段、同一篇文章重开。
 * 命中即 0ms / 0 成本，是当前投入产出比最高的一项优化。
 *
 * 存储抽象成最小的 StorageLike（getItem/setItem/removeItem/key/length），
 * 这样单测用 localStorage，生产用 chrome.storage 适配器，不需要 mock chrome API。
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

export interface CachedChunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface ChunkCacheOptions {
  /** 最大条目数，超出后按写入顺序淘汰最旧的 */
  maxEntries?: number;
}

export interface ChunkCache {
  get(key: string): CachedChunk[] | undefined;
  set(key: string, chunks: CachedChunk[]): void;
  clear(): void;
}

const KEY_PREFIX = "chunkly.cache.";
const DEFAULT_MAX_ENTRIES = 50;

/**
 * 由切分输入派生缓存 key。
 * 任何会改变结果的维度都必须进 key，否则会读到错的缓存。
 */
export function buildCacheKey(input: {
  text: string;
  model: string;
  baseURL: string;
  reasoningEffort?: string;
  granularity?: string;
}): string {
  const raw = [
    input.baseURL,
    input.model,
    input.reasoningEffort ?? "-",
    input.granularity ?? "-",
    input.text,
  ].join("\u0000");

  // 简单稳定的字符串哈希（FNV-1a 变体）。不需要密码学强度，只要碰撞率可接受。
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}-${raw.length.toString(36)}`;
}

export function createChunkCache(
  storage: StorageLike,
  options: ChunkCacheOptions = {}
): ChunkCache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;

  function cacheKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }

  function evictIfNeeded(): void {
    const keys = cacheKeys();
    // 超出上限时按当前枚举顺序淘汰（localStorage 按插入顺序枚举）
    for (let i = 0; i <= keys.length - maxEntries; i++) {
      storage.removeItem(keys[i]);
    }
  }

  return {
    get(key: string): CachedChunk[] | undefined {
      const raw = storage.getItem(KEY_PREFIX + key);
      if (raw === null) return undefined;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return undefined;
        // 形状校验：坏数据当 miss，不要让上层崩在奇怪的地方
        const valid = parsed.every(
          (c) =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as CachedChunk).text === "string" &&
            typeof (c as CachedChunk).startOffset === "number" &&
            typeof (c as CachedChunk).endOffset === "number"
        );
        return valid ? (parsed as CachedChunk[]) : undefined;
      } catch {
        return undefined;
      }
    },

    set(key: string, chunks: CachedChunk[]): void {
      try {
        storage.setItem(KEY_PREFIX + key, JSON.stringify(chunks));
        evictIfNeeded();
      } catch {
        // 配额满等写入失败：静默放弃缓存，不影响主流程
      }
    },

    clear(): void {
      cacheKeys().forEach((k) => storage.removeItem(k));
    },
  };
}
