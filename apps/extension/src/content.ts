/**
 * Content script：捕获用户选中文本，交给 background 调 LLM，再按 offset 在 DOM 上高亮。
 *
 * 这里**不直接发网络请求**——请求在 background service worker 里发出，原因见 background.ts。
 */
import { chunkFast, type Chunk } from "@chunkly/engine";
import { applyHighlight, undoHighlight } from "./highlight.js";
import type { ChunkResponseMessage } from "./types.js";

const ERROR_HINT: Record<string, string> = {
  NO_API_KEY: "Chunkly：尚未配置 API Key，请点击插件图标打开设置页完成配置",
  AUTH_FAILED: "Chunkly：API Key 无效，请到设置页检查配置",
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
    // 规则法先出的结果用虚线标出，告诉用户“这版可能不准，正在优化”
    ".chunkly-provisional { outline: 1px dashed rgba(107,114,128,.55); outline-offset: -1px; }",
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

  // 再次切分前先收回上一次的高亮，避免 span 嵌套、也避免页面越改越乱。
  undoHighlight(document.body);
  ensureHighlightStyleInjected();

  // ---- 第一阶段：规则法秒出 ----
  // 云端 LLM 有约 2.4s 的恒定前置开销，且与输出长度无关（见 docs/优化清单.md）。
  // 等它等于让用户盯空白 2.4 秒，所以先用规则法渲染一版（<1ms），
  // 再让 LLM 结果到达后覆盖。规则版用虚线标出，表示“可能不准”。
  const provisional = chunkFast(text);
  if (provisional.length > 0) {
    applyHighlight(range, text, provisional);
    markProvisional();
  }

  const toast = showToast("Chunkly：正在用模型优化切分…");

  // ---- 第二阶段：LLM 精确结果 ----
  let response: ChunkResponseMessage;
  try {
    response = (await chrome.runtime.sendMessage({
      type: "CHUNKLY_CHUNK",
      text,
    })) as ChunkResponseMessage;
  } catch {
    toast.textContent = "Chunkly：无法连接后台，已保留规则切分";
    clearProvisionalMark();
    setTimeout(() => toast.remove(), 2500);
    return;
  }

  if (!response || !response.ok) {
    const code = response?.error?.code;
    // 关键是：LLM 失败时**不要**清掉规则版，降级可读总比空白好
    toast.textContent =
      ((code && ERROR_HINT[code]) ?? "Chunkly：模型切分失败") + "（已保留规则切分）";
    clearProvisionalMark();
    setTimeout(() => toast.remove(), 2500);
    return;
  }

  toast.remove();
  applyFinalHighlight(response.chunks, text, response.cached);
}

/**
 * 用 LLM 结果覆盖规则法的结果。
 *
 * 做法：先撤销规则版（无损，见 ADR-0001），再根据当前选区重新定位并高亮。
 * 不能复用第一次的 range：撤销会 normalize 文本节点，旧 range 的容器可能已失效。
 */
function applyFinalHighlight(
  chunks: Array<{ text: string; startOffset: number; endOffset: number }>,
  text: string,
  cached: boolean
): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  undoHighlight(document.body);
  ensureHighlightStyleInjected();

  const range = selection.getRangeAt(0);
  applyHighlight(range, text, chunks as Chunk[]);
  clearProvisionalMark();

  if (cached) {
    const t = showToast("Chunkly：命中缓存");
    setTimeout(() => t.remove(), 1200);
  }
}

/** 给当前所有高亮加上“暂定”标记 */
function markProvisional(): void {
  document
    .querySelectorAll(".chunkly-chunk")
    .forEach((el) => el.classList.add("chunkly-provisional"));
}

function clearProvisionalMark(): void {
  document
    .querySelectorAll(".chunkly-provisional")
    .forEach((el) => el.classList.remove("chunkly-provisional"));
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "CHUNKLY_TRIGGER") {
    void handleTrigger();
  }
  if (message?.type === "CHUNKLY_UNDO") {
    undoHighlight(document.body);
  }
});
