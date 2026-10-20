/**
 * Content script：捕获用户选中文本，调用 engine.chunk，按 offset 在 DOM 上高亮。
 */
import { chunk, ChunkEngineError } from "@chunkly/engine";
import { loadSettings } from "./storage.js";
import { applyHighlight } from "./highlight.js";

const ERROR_HINT: Record<string, string> = {
  AUTH_FAILED: "Chunkly：API Key 无效，请到设置页检查配置",
  RATE_LIMITED: "Chunkly：触发速率限制，请稍后再试",
  TIMEOUT: "Chunkly：请求超时，请重试",
  SERVICE_UNAVAILABLE: "Chunkly：服务暂时不可用，请检查网络后重试",
  INVALID_RESPONSE: "Chunkly：切分结果解析失败，请重试",
  NETWORK_ERROR: "Chunkly：网络错误，请检查网络后重试",
};

const HIGHLIGHT_STYLE_ID = "chunkly-highlight-style";
const PALETTE = ["#FDE68A", "#BFDBFE", "#C7F9CC", "#FBCFE8"];

function ensureHighlightStyleInjected(): void {
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = [
    ".chunkly-chunk { border-radius: 3px; padding: 0 1px; }",
    ...PALETTE.map((color, i) => `.chunkly-chunk-${i} { background-color: ${color}; }`),
  ].join("\n");
  document.head.appendChild(style);
}

async function handleTrigger(): Promise<void> {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }

  const range = selection.getRangeAt(0);
  const text = selection.toString();
  if (text.trim().length === 0) {
    return;
  }

  try {
    const settings = await loadSettings();
    if (!settings.provider.apiKey) {
      window.alert("Chunkly：尚未配置 API Key，请点击插件图标打开设置页完成配置");
      return;
    }
    const result = await chunk(text, { provider: settings.provider });
    ensureHighlightStyleInjected();
    applyHighlight(range, text, result.chunks);
  } catch (err) {
    const code = err instanceof ChunkEngineError ? err.code : undefined;
    const hint = code ? ERROR_HINT[code] : "Chunkly：发生未知错误";
    window.alert(hint ?? "Chunkly：发生未知错误");
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CHUNKLY_TRIGGER") {
    void handleTrigger();
  }
});
