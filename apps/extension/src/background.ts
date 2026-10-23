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
import { effortForModel } from "./types.js";
import { createChunkCache, buildCacheKey, type StorageLike } from "./cache.js";
import type { ChunkRequestMessage, ChunkResponseMessage, StoredSettings } from "./types.js";

const MENU_ID = "chunkly-chunk-selection";
const MENU_SPEAK_ID = "chunkly-speak-selection";
const MENU_UNDO_ID = "chunkly-undo";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "用 Chunkly 切分选中文本",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU_SPEAK_ID,
    title: "Chunkly：意群卡拉OK朗读",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: MENU_UNDO_ID,
    title: "Chunkly：清除高亮与朗读",
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
  } else if (info.menuItemId === MENU_SPEAK_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "CHUNKLY_SPEAK" });
  } else if (info.menuItemId === MENU_UNDO_ID) {
    chrome.tabs.sendMessage(tab.id, { type: "CHUNKLY_UNDO" });
  }
});

/** 快捷键：转发给当前激活 tab 的 content script */
chrome.commands?.onCommand.addListener((command, tab) => {
  if (tab?.id === undefined) return;
  const type =
    command === "chunk-selection"
      ? "CHUNKLY_TRIGGER"
      : command === "speak-selection"
      ? "CHUNKLY_SPEAK"
      : command === "undo-highlight"
      ? "CHUNKLY_UNDO"
      : null;
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

  if (message?.type === "CHUNKLY_FETCH_TTS") {
    const text = typeof message.text === "string" ? message.text.trim() : "";
    const lang = typeof message.lang === "string" ? message.lang : "en";
    fetchGoogleTTSAudio(text, lang)
      .then((audioUrl) => {
        sendResponse({ ok: true, audioUrl });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: String(err) });
      });
    return true;
  }

  if (message?.type === "TEST_CONNECTION") {
    void handleTestConnection(message.settings).then(sendResponse);
    return true; // 异步响应
  }

  return undefined;
});

async function handleTestConnection(
  targetSettings?: StoredSettings
): Promise<{ ok: boolean; status?: number; elapsed?: number; error?: string }> {
  try {
    const settings = targetSettings ?? (await loadSettings());
    const apiKey = resolveApiKey(settings);
    if (!apiKey) {
      return {
        ok: false,
        error:
          settings.mode === "official"
            ? "构建时未注入官方 Key，请到设置页切换为「自定义」并填写自己的 Key"
            : "尚未填写 API Key",
      };
    }

    const startedAt = Date.now();
    const url = settings.provider.baseURL.replace(/\/+$/, "") + "/chat/completions";
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: settings.provider.model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 4,
        temperature: 0,
      }),
    });

    const elapsed = Date.now() - startedAt;
    const bodyText = await resp.text().catch(() => "");
    if (resp.ok) {
      return { ok: true, elapsed };
    }
    return {
      ok: false,
      status: resp.status,
      elapsed,
      error: describeHttpFailure(resp.status, bodyText, settings.provider.baseURL),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `无法连接：${message}` };
  }
}

function describeHttpFailure(status: number, bodyText: string, baseURL: string): string {
  const snippet = bodyText.slice(0, 140).replace(/\s+/g, " ").trim();
  let host = baseURL;
  try {
    host = new URL(baseURL).host;
  } catch {
    // ignore
  }
  const tail = snippet ? ` 详情：${snippet}` : "";

  if (status === 401 || status === 403) {
    return `鉴权失败（${status}）。请确认这个 Key 属于 ${host} —— Key 与地址必须来自同一家服务。${tail}`;
  }
  if (status === 404) {
    return `地址不存在（404）。检查 API 地址是否漏了路径，例如应形如 …/provider/v1。${tail}`;
  }
  if (status === 429) {
    return `触发限流（429）。稍后再试。${tail}`;
  }
  if (status >= 500) {
    return `服务端错误（${status}）。不是你的配置问题，稍后重试。${tail}`;
  }
  return `请求失败（${status}）。${tail}`;
}

async function handleChunk(message: ChunkRequestMessage): Promise<ChunkResponseMessage> {
  try {
    const settings = await loadSettings();
    const apiKey = resolveApiKey(settings);
    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: settings.mode === "official" ? "NO_OFFICIAL_KEY" : "NO_API_KEY",
          message:
            settings.mode === "official"
              ? "此版本未内置官方 Key，请到设置页切换到「自定义」并填入你自己的 Key"
              : "尚未配置 API Key",
          retryable: false,
        },
      };
    }

    const cache = await getCache();
    const cacheKey = buildCacheKey({
      text: message.text,
      baseURL: settings.provider.baseURL,
      model: settings.provider.model,
    });

    const hit = cache.get(cacheKey);
    if (hit) {
      return { ok: true, chunks: hit, cached: true };
    }

    // reasoning effort 按模型写死最优值：切分是浅层句法任务，thinking 纯浪费，
    // 实测差 4.4 倍（deepseek off 2340ms vs 不传 10368ms 的 glm）。
    // 但支持的取值因模型而异（off 只有部分模型接受，传给 glm 会 400），
    // 所以只能逐模型配对，不能全局设一个。
    const result = await chunk(message.text, {
      provider: { ...settings.provider, apiKey },
      // 自定义模式不干预用户配的模型，交给服务端默认
      reasoningEffort:
        settings.mode === "official"
          ? (effortForModel(settings.provider.model) as
              | "off"
              | "low"
              | "medium"
              | "high"
              | undefined)
          : undefined,
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
 * 决定本次请求用哪个 Key。
 *
 * 官方模式的 Key **不放在设置页**（那是用户可读的），而是构建时注入到
 * background 里。这样可以避免把开发者配额交给每个用户，也不会出现
 * 「用户手滑改掉官方 Key 就永远 401」的情况。
 *
 * 自定义模式才用用户自己填的 Key。
 */
function resolveApiKey(settings: { mode: string; provider: { apiKey: string } }): string {
  if (settings.mode === "custom") {
    return settings.provider.apiKey;
  }
  const injected =
    typeof __CHUNKLY_OFFICIAL_API_KEY__ === "string" ? __CHUNKLY_OFFICIAL_API_KEY__ : "";
  return injected;
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

/** Google Translate 高品质云端神经音频缓存 */
const ttsAudioCache = new Map<string, string>();

export async function fetchGoogleTTSAudio(text: string, lang = "en"): Promise<string> {
  const cacheKey = `${lang}:${text}`;
  const hit = ttsAudioCache.get(cacheKey);
  if (hit) return hit;

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
    lang
  )}&q=${encodeURIComponent(text)}`;

  // 严格设置 2500ms 超时：若 Google 服务受阻或断网，立即中断并降级为本地神经语音，坚决不阻塞用户听感
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Google TTS HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = `data:audio/mpeg;base64,${btoa(binary)}`;

    if (ttsAudioCache.size > 80) {
      const firstKey = ttsAudioCache.keys().next().value;
      if (firstKey) ttsAudioCache.delete(firstKey);
    }
    ttsAudioCache.set(cacheKey, base64);
    return base64;
  } finally {
    clearTimeout(timer);
  }
}
