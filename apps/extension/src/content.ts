/**
 * Content script：捕获用户选中文本，交给 background 调 LLM，再按 offset 进行意群高亮与视听同步。
 *
 * 核心功能：
 * 1. 意群切分高亮（Paper Tint 自然纸质荧光笔，CSS Custom Highlight 优先）；
 * 2. 划词悬浮控制栏（✨ Chunk 高亮 + 🔊 朗读双入口）；
 * 3. 意群卡拉OK朗读与影子跟读（Phrase-cued TTS / Shadowing，零本地模型下载，毫秒级视听对齐）。
 */
import type { Chunk } from "@chunkly/engine";
import {
  applyHighlight,
  undoHighlight,
  undoHighlightInRange,
  setActiveHighlightChunk,
} from "./highlight.js";
import { setupBubbleTrigger } from "./bubble.js";
import { loadSettings } from "./storage.js";
import {
  createTTSPlayer,
  type TTSPlayer,
  type TTSMode,
  type ChunkItem,
} from "./tts.js";
import type { ChunkResponseMessage, HighlightStyle } from "./types.js";

const ERROR_HINT: Record<string, string> = {
  NO_API_KEY: "Chunkly：尚未配置 API Key，请点击插件图标打开设置页完成配置",
  NO_OFFICIAL_KEY: "Chunkly：官方模式未注入有效 Key，请在设置页切换为「自定义」并填入 Key",
  AUTH_FAILED: "Chunkly：鉴权失败。请到设置页确认「API 地址」与「Key」是否匹配",
  RATE_LIMITED: "Chunkly：触发速率限制，请稍后再试",
  TIMEOUT: "Chunkly：请求超时，请重试",
  SERVICE_UNAVAILABLE: "Chunkly：服务暂时不可用，请检查网络后重试",
  BAD_REQUEST: "Chunkly：模型拒绝了请求参数，请在设置页更换模型",
  INVALID_RESPONSE: "Chunkly：切分结果解析失败，请重试",
  NETWORK_ERROR: "Chunkly：网络连接失败，请检查网络设置",
};

const TOAST_ID = "chunkly-toast";
const PLAYER_BAR_ID = "chunkly-player-bar";

let activePlayerBar: HTMLElement | null = null;
const ttsPlayer: TTSPlayer = createTTSPlayer({
  fetchAudio: async (text: string, lang: string) => {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        const response = await chrome.runtime.sendMessage({
          type: "CHUNKLY_FETCH_TTS",
          text,
          lang,
        });
        if (response?.ok && typeof response.audioUrl === "string") {
          return response.audioUrl;
        }
      }
    } catch {
      // 容错：离线或请求失败时自动降级到本地合成
    }
    return null;
  },
});
let currentPlayChunks: ChunkItem[] = [];
let currentPlaybackScopeId: string | null = null;
let currentPlaybackMode: TTSMode = "karaoke";
let currentSpeechRate = 1.0;

/** 极简 loading / 状态提示 */
function showToast(text: string, isLoading = false): HTMLElement {
  document.getElementById(TOAST_ID)?.remove();
  const el = document.createElement("div");
  el.id = TOAST_ID;
  el.textContent = text;
  if (isLoading) {
    el.classList.add("chunkly-toast-loading");
  }
  document.body.appendChild(el);
  return el;
}

function removePlayerBar(): void {
  if (activePlayerBar) {
    activePlayerBar.remove();
    activePlayerBar = null;
  }
  document.getElementById(PLAYER_BAR_ID)?.remove();
  setActiveHighlightChunk(document.body, null);
}

function renderPlayerBar(
  onTogglePlay: () => void,
  onToggleMode: () => void,
  onCycleSpeed: () => void
): HTMLElement {
  removePlayerBar();

  const bar = document.createElement("div");
  bar.id = PLAYER_BAR_ID;

  const modeBadge = document.createElement("span");
  modeBadge.className = "chunkly-player-badge";
  modeBadge.id = "chunkly-player-mode";
  modeBadge.title = "点击在 卡拉OK朗读 与 影子跟读 之间切换";
  modeBadge.textContent = currentPlaybackMode === "karaoke" ? "🔊 卡拉OK" : "🔁 影子跟读";
  modeBadge.addEventListener("click", () => {
    onToggleMode();
  });

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "chunkly-player-btn";
  toggleBtn.id = "chunkly-player-toggle";
  toggleBtn.title = "暂停 / 继续";
  toggleBtn.textContent = "⏸";
  toggleBtn.addEventListener("click", () => {
    onTogglePlay();
    toggleBtn.textContent = ttsPlayer.isPlaying() ? "⏸" : "▶";
  });

  const speedBtn = document.createElement("button");
  speedBtn.type = "button";
  speedBtn.className = "chunkly-player-btn";
  speedBtn.id = "chunkly-player-speed";
  speedBtn.title = "切换语速 (0.8x / 1.0x / 1.2x)";
  speedBtn.textContent = `${currentSpeechRate.toFixed(1)}x`;
  speedBtn.addEventListener("click", () => {
    onCycleSpeed();
  });

  const closeBtn = document.createElement("span");
  closeBtn.className = "chunkly-player-close";
  closeBtn.title = "停止发音";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    ttsPlayer.stop();
    setActiveHighlightChunk(document.body, null, currentPlaybackScopeId);
    removePlayerBar();
  });

  bar.append(modeBadge, toggleBtn, speedBtn, closeBtn);
  document.body.appendChild(bar);
  activePlayerBar = bar;
  return bar;
}

function startPlayback(chunks: ChunkItem[], scopeId?: string | null): void {
  if (currentPlaybackScopeId) {
    setActiveHighlightChunk(document.body, null, currentPlaybackScopeId);
  }
  currentPlayChunks = chunks;
  if (scopeId !== undefined) {
    currentPlaybackScopeId = scopeId;
  }
  ttsPlayer.play(chunks, {
    mode: currentPlaybackMode,
    rate: currentSpeechRate,
    onChunkStart: (index) => {
      setActiveHighlightChunk(document.body, index, currentPlaybackScopeId);
    },
    onShadowPause: (_index, pauseMs) => {
      const modeBadge = document.getElementById("chunkly-player-mode");
      if (modeBadge) {
        modeBadge.textContent = "🎙️ 跟读中…";
        setTimeout(() => {
          if (modeBadge) {
            modeBadge.textContent = currentPlaybackMode === "karaoke" ? "🔊 卡拉OK" : "🔁 影子跟读";
          }
        }, pauseMs);
      }
    },
    onComplete: () => {
      setActiveHighlightChunk(document.body, null, currentPlaybackScopeId);
      removePlayerBar();
    },
  });

  renderPlayerBar(
    () => {
      if (ttsPlayer.isPlaying()) {
        ttsPlayer.pause();
      } else {
        ttsPlayer.resume();
      }
    },
    () => {
      currentPlaybackMode = currentPlaybackMode === "karaoke" ? "shadowing" : "karaoke";
      startPlayback(currentPlayChunks, currentPlaybackScopeId);
    },
    () => {
      if (currentSpeechRate === 1.0) currentSpeechRate = 1.2;
      else if (currentSpeechRate === 1.2) currentSpeechRate = 0.8;
      else currentSpeechRate = 1.0;
      startPlayback(currentPlayChunks, currentPlaybackScopeId);
    }
  );
}

async function handleTrigger(shouldSpeak = false): Promise<void> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  // 关键：立即克隆选区 Range，防止异步等待期间用户点击页面导致选区坍缩
  const range = selection.getRangeAt(0).cloneRange();
  const text = selection.toString();
  if (text.trim().length === 0) {
    return;
  }

  // 只清除**本次选区范围内**已有的旧高亮，保留页面其余部分
  undoHighlightInRange(range);

  const toast = showToast(shouldSpeak ? "Chunkly：意群伴读准备中…" : "Chunkly：意群解析中…", true);

  let response: ChunkResponseMessage;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "CHUNKLY_CHUNK",
      text,
    })) as ChunkResponseMessage;
  } catch {
    toast.classList.remove("chunkly-toast-loading");
    toast.textContent = "Chunkly：无法连接后台，请重新加载插件";
    setTimeout(() => toast.remove(), 3000);
    return;
  }

  if (!response || !response.ok) {
    toast.classList.remove("chunkly-toast-loading");
    const code = response?.error?.code;
    const msg = response?.error?.message;
    let displayText = (code && ERROR_HINT[code]) ?? "Chunkly：发生未知错误";
    if (code === "BAD_REQUEST" && msg) {
      displayText = `Chunkly：请求被拒绝 — ${msg}`;
    }
    toast.textContent = displayText;
    setTimeout(() => toast.remove(), 4000);
    return;
  }

  toast.remove();
  const chunkList = response.chunks as Chunk[];
  const scopeId = `scope-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  applyHighlight(range, text, chunkList, scopeId);

  if (shouldSpeak) {
    startPlayback(chunkList, scopeId);
  }

  if (response.cached && !shouldSpeak) {
    const t = showToast("Chunkly：命中缓存");
    setTimeout(() => t.remove(), 1200);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CHUNKLY_TRIGGER") {
    void handleTrigger(false);
  }
  if (message?.type === "CHUNKLY_SPEAK") {
    void handleTrigger(true);
  }
  if (message?.type === "CHUNKLY_UNDO") {
    ttsPlayer.stop();
    setActiveHighlightChunk(document.body, null, currentPlaybackScopeId);
    removePlayerBar();
    undoHighlight(document.body);
  }
});

// 划词浮动控制栏（Selection Bubble Bar）与视觉风格初始化
let isBubbleEnabled = true;

function updateHighlightStyle(style: HighlightStyle = "highlighter"): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.dataset.chunklyStyle = style;
  }
}

loadSettings()
  .then((settings) => {
    isBubbleEnabled = settings.showBubbleTrigger ?? true;
    updateHighlightStyle(settings.highlightStyle ?? "highlighter");
  })
  .catch(() => {
    isBubbleEnabled = true;
    updateHighlightStyle("highlighter");
  });

try {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local" && changes["chunkly.settings"]) {
      const next = changes["chunkly.settings"].newValue;
      if (typeof next?.showBubbleTrigger === "boolean") {
        isBubbleEnabled = next.showBubbleTrigger;
      }
      if (typeof next?.highlightStyle === "string") {
        updateHighlightStyle(next.highlightStyle as HighlightStyle);
      }
    }
  });
} catch {
  // 忽略受限环境
}

setupBubbleTrigger({
  onTrigger: (intent) => {
    void handleTrigger(intent === "speak");
  },
  isEnabled: () => isBubbleEnabled,
});
