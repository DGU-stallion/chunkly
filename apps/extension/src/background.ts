/**
 * Background service worker：注册右键菜单触发切分，处理设置页的自定义域名权限申请，
 * 并**代替 content script 发起 LLM 请求**。
 *
 * 为什么请求必须在这里发：
 * - content script 的 fetch 带的是「页面 origin」（如 https://example.com）。本机网关
 *   （magpie 等）会把未知页面 origin 判为 permission_error 直接 403；而 service worker
 *   的 origin 是 chrome-extension://<id>，网关放行。
 * - content script 里放 API Key，等于把密钥放进页面所在的进程，页面脚本可见。
 * - 后续若要接 Chrome 内置 Prompt API（Gemini Nano），它也不在 content script 的
 *   isolated world 语义里，同样适合放在这里。
 */
import { chunk, ChunkEngineError } from "@chunkly/engine";
import { loadSettings } from "./storage.js";
import { createChunkCache, buildCacheKey, type StorageLike } from "./cache.js";
import type { ChunkRequestMessage, ChunkResponseMessage } from "./types.js";

const MENU_ID = "chunkly-chunk-selection";
const MENU_UNDO_ID = "chunkly-undo";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "用 Chunkly 切分选中文本",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU_UNDO_ID,
    title: "Chunkly：清除高亮",
    contexts: ["page", "selection"],
  });
});

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  if (info.menuItemId === MENU_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "CHUNKLY_TRIGGER" });
  } else if (info.menuItemId === MENU_UNDO_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "CHUNKLY_UNDO" });
  }
});

/** 快捷键：转发给当前激活 tab 的 content script */
chrome.commands?.onCommand.addListener((command, tab) => {
  if (tab?.id === undefined) return;
  const type = command === "chunk-selection" ? "CHUNKLY_TRIGGER" : command === "undo-highlight" ? "CHUNKLY_UNDO" : null;
  if (type) {
    chrome.tabs.sendMessage(tab.id, { type });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REQUEST_HOST_PERMISSION" && typeof message.origin === "string") {
    chrome.permissions
      .request({ origins: [message.origin] })
      .then((granted) => sendResponse({ granted }))
      .catch(() => sendResponse({ granted: false }));
    return true; // 异步响应
  }

  if (message?.type === "CHUNKLY_CHUNK") {
    void handleChunk(message as ChunkRequestMessage).then(sendResponse);
    return true; // 异步响应
  }

  return undefined;
});

async function handleChunk(message: ChunkRequestMessage): Promise<ChunkResponseMessage> {
  try {
    const settings = await loadSettings();
    if (!settings.provider.apiKey) {
      return {
        ok: false,
        error: { code: "NO_API_KEY", message: "尚未配置 API Key", retryable: false },
      };
    }

    const cache = await getCache();
    const cacheKey = buildCacheKey({
      text: message.text,
      baseURL: settings.provider.baseURL,
      model: settings.provider.model,
      reasoningEffort: settings.reasoningEffort,
    });

    const hit = cache.get(cacheKey);
    if (hit) {
      return { ok: true, chunks: hit, cached: true };
    }

    const result = await chunk(message.text, {
      provider: settings.provider,
      reasoningEffort: settings.reasoningEffort,
    });

    const chunks = result.chunks.map((c) => ({
      text: c.text,
      startOffset: c.startOffset,
      endOffset: c.endOffset,
    }));
    cache.set(cacheKey, chunks);

    return { ok: true, chunks, cached: false };
  } catch (err) {
    if (err instanceof ChunkEngineError) {
      return { ok: false, error: { code: err.code, message: err.message, retryable: err.retryable } };
    }
    return {
      ok: false,
      error: { code: "NETWORK_ERROR", message: String(err), retryable: true },
    };
  }
}

/**
 * chrome.storage.local 的 StorageLike 适配器。
 *
 * 注意：chrome.storage 的 API 是异步的，而 StorageLike 是同步接口，
 * 所以这里先把整个 namespace 读进内存，写入时同步更新内存并异步回写。
 * MV3 service worker 会被回收，缓存本身不依赖内存长期存活；
 * 内存层只是避免每次 get 都等一遍异步 IO。
 */
let cacheInstance: ReturnType<typeof createChunkCache> | null = null;

async function getCache(): Promise<ReturnType<typeof createChunkCache>> {
  if (cacheInstance) return cacheInstance;

  const all = await chrome.storage.local.get(null);
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(all)) {
    if (typeof v === "string") map.set(k, v);
  }

  const adapter: StorageLike = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
      void chrome.storage.local.set({ [k]: v });
    },
    removeItem: (k) => {
      map.delete(k);
      void chrome.storage.local.remove(k);
    },
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  };

  cacheInstance = createChunkCache(adapter);
  return cacheInstance;
}
