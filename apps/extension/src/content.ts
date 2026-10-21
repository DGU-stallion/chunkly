/**
 * Content script：捕获用户选中文本，交给 background 调 LLM，再按 offset 在 DOM 上高亮。
 *
 * 这里**不直接发网络请求**——请求在 background service worker 里发出，原因见 background.ts。
 */
import type { Chunk } from "@chunkly/engine";
import { applyHighlight, undoHighlight, undoHighlightInRange } from "./highlight.js";
import type { ChunkResponseMessage } from "./types.js";

const ERROR_HINT: Record<string, string> = {
  NO_API_KEY: "Chunkly：尚未配置 API Key，请点击插件图标打开设置页完成配置",
  // 不要把 401 一律说成「Key 无效」：实测更常见的原因是 provider 配错了
  // （例如把 CommandCode 的 user_ key 填到了智谱地址上）。提示要指向真正要检查的东西。
  AUTH_FAILED: "Chunkly：鉴权失败。请到设置页确认「API 地址」与「Key」是同一家的",
  RATE_LIMITED: "Chunkly：触发速率限制，请稍后再试",
  TIMEOUT: "Chunkly：请求超时，请重试",
  SERVICE_UNAVAILABLE: "Chunkly：服务暂时不可用，请检查网络后重试",
  INVALID_RESPONSE: "Chunkly：切分结果解析失败，请重试",
  NETWORK_ERROR: "Chunkly：无法连接。若使用本地网关，请确认网关已启动",
};

const HIGHLIGHT_STYLE_ID = "chunkly-highlight-style";
const TOAST_ID = "chunkly-toast";
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
    "#" + TOAST_ID + " { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px;",
    "  padding: 8px 12px; border-radius: 6px; background: #111827; color: #fff;",
    "  font: 13px/1.4 system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.25); }",
  ].join("\n");
  document.head.appendChild(style);
}

/** 极简 loading / 错误提示，替代浏览器原生 alert（后者会阻塞页面且体验差）。 */
function showToast(text: string): HTMLElement {
  ensureHighlightStyleInjected();
  document.getElementById(TOAST_ID)?.remove();
  const el = document.createElement("div");
  el.id = TOAST_ID;
  el.textContent = text;
  document.body.appendChild(el);
  return el;
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

  ensureHighlightStyleInjected();

  // 只清除**本次选区范围内**的高亮，不清整页。
  //
  // 早期实现是 undoHighlight(document.body)，结果用户切了第二段之后
  // 第一段的高亮全没了。意群辅助的用法就是逐段读、回头对，清空整页等于
  // 强迫用户只能看一段。
  undoHighlightInRange(range);

  const toast = showToast("Chunkly：切分中…");

  let response: ChunkResponseMessage;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "CHUNKLY_CHUNK",
      text,
    })) as ChunkResponseMessage;
  } catch {
    toast.textContent = "Chunkly：无法连接后台，请重新加载插件";
    return;
  }

  if (!response || !response.ok) {
    const code = response?.error?.code;
    toast.textContent = (code && ERROR_HINT[code]) ?? "Chunkly：发生未知错误";
    setTimeout(() => toast.remove(), 3000);
    return;
  }

  toast.remove();
  applyHighlight(range, text, response.chunks as Chunk[]);

  if (response.cached) {
    const t = showToast("Chunkly：命中缓存");
    setTimeout(() => t.remove(), 1200);
  }
}


chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CHUNKLY_TRIGGER") {
    void handleTrigger();
  }
  if (message?.type === "CHUNKLY_UNDO") {
    undoHighlight(document.body);
  }
});
