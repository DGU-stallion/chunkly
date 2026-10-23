/**
 * 划词浮动气泡（Selection Bubble Trigger）模块。
 *
 * 核心设计原则：
 * 1. 轻量防打扰：纯数字、纯标点、过短字符不触发；
 * 2. 交互不冲突：mousedown 阻止默认事件，防止点击气泡瞬间导致浏览器选区坍缩；
 * 3. 边界自适应：超出顶部翻转至下方，横向自动 clamp 在视区内；
 * 4. 读听双快捷入口：同时支持「✨ Chunk」高亮与「🔊 朗读」卡拉OK发音。
 */

export const BUBBLE_ID = "chunkly-bubble-trigger";
const BUBBLE_WIDTH_APPROX = 148;
const BUBBLE_HEIGHT_APPROX = 32;

/** 判定选区文本是否值得触发 Chunk 按钮 */
export function shouldShowBubble(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  // 必须包含至少一个英文字母，排除纯数字或纯标点
  return /[a-zA-Z]/.test(trimmed);
}

/** 计算浮动按钮的 absolute 坐标 */
export function computeBubblePosition(
  rect: DOMRect,
  scrollX: number,
  scrollY: number,
  viewportWidth: number,
  viewportHeight: number,
): { top: number; left: number } {
  const horizontalCenter = rect.left + rect.width / 2;
  let left = horizontalCenter - BUBBLE_WIDTH_APPROX / 2 + scrollX;

  // 横向 Clamp 在视口内（保留 10px 边距）
  const minLeft = scrollX + 10;
  const maxLeft = scrollX + viewportWidth - BUBBLE_WIDTH_APPROX - 10;
  left = Math.max(minLeft, Math.min(maxLeft, left));

  // 纵向：默认选区上方 8px（如果空间足够）
  let top = rect.top + scrollY - BUBBLE_HEIGHT_APPROX - 8;
  if (rect.top < BUBBLE_HEIGHT_APPROX + 16) {
    // 靠近屏幕顶端时翻转到选区下方
    top = rect.bottom + scrollY + 8;
  }

  return { top, left };
}

export type BubbleAction =
  | (() => void)
  | { onChunk: () => void; onSpeak?: () => void };

/** 创建气泡 DOM 元素 */
export function createBubbleElement(action: BubbleAction): HTMLElement {
  const container = document.createElement("div");
  container.id = BUBBLE_ID;
  container.className = "chunkly-bubble-bar";

  // 关键：阻止 mousedown 默认行为，否则会清空当前选区 Range
  container.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  if (typeof action === "function") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chunkly-bubble-btn";
    btn.id = "chunkly-btn-chunk";
    btn.title = "Chunkly 意群切分";
    btn.innerHTML = `<span class="chunkly-bubble-icon">✨</span><span class="chunkly-bubble-text">Chunk</span>`;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    });
    container.appendChild(btn);

    // 支持直接在 container 上派发 click 事件（用于单测兼容器）
    container.addEventListener("click", (e) => {
      if (e.target === container) {
        action();
      }
    });
    return container;
  }

  // 双按钮模式：Chunk 切分 + 朗读发音
  const chunkBtn = document.createElement("button");
  chunkBtn.type = "button";
  chunkBtn.className = "chunkly-bubble-btn";
  chunkBtn.id = "chunkly-btn-chunk";
  chunkBtn.title = "Chunkly 意群切分";
  chunkBtn.innerHTML = `<span class="chunkly-bubble-icon">✨</span><span class="chunkly-bubble-text">Chunk</span>`;
  chunkBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    action.onChunk();
  });
  container.appendChild(chunkBtn);

  if (action.onSpeak) {
    const sep = document.createElement("span");
    sep.className = "chunkly-bubble-sep";
    container.appendChild(sep);

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "chunkly-bubble-btn";
    speakBtn.id = "chunkly-btn-speak";
    speakBtn.title = "意群卡拉OK朗读";
    speakBtn.innerHTML = `<span class="chunkly-bubble-icon">🔊</span><span class="chunkly-bubble-text">朗读</span>`;
    speakBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      action.onSpeak?.();
    });
    container.appendChild(speakBtn);
  }

  // 默认直接点击气泡空白处视作触发 Chunk 切分
  container.addEventListener("click", (e) => {
    if (e.target === container) {
      action.onChunk();
    }
  });

  return container;
}

export interface SetupBubbleOptions {
  onTrigger: (intent?: "chunk" | "speak") => void;
  isEnabled: () => boolean;
}

/** 在页面全局注册划选监听 */
export function setupBubbleTrigger(options: {
  onTrigger: (intent?: "chunk" | "speak") => void;
  isEnabled: () => boolean;
}): { destroy: () => void } {
  let activeBubble: HTMLElement | null = null;

  function removeBubble(): void {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
    const existing = document.getElementById(BUBBLE_ID);
    if (existing) existing.remove();
  }

  function handleSelection(): void {
    if (!options.isEnabled()) {
      removeBubble();
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      removeBubble();
      return;
    }

    const text = selection.toString();
    if (!shouldShowBubble(text)) {
      removeBubble();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect =
      typeof range.getBoundingClientRect === "function"
        ? range.getBoundingClientRect()
        : null;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      removeBubble();
      return;
    }

    removeBubble();

    const bubble = createBubbleElement({
      onChunk: () => {
        removeBubble();
        options.onTrigger("chunk");
      },
      onSpeak: () => {
        removeBubble();
        options.onTrigger("speak");
      },
    });

    const pos = computeBubblePosition(
      rect,
      window.scrollX,
      window.scrollY,
      window.innerWidth,
      window.innerHeight,
    );

    bubble.style.position = "absolute";
    bubble.style.top = `${pos.top}px`;
    bubble.style.left = `${pos.left}px`;
    bubble.style.zIndex = "2147483646";

    document.body.appendChild(bubble);
    activeBubble = bubble;
  }

  function onMouseUp(e: MouseEvent): void {
    // 延迟 10ms 确保浏览器 selection 已完成更新
    setTimeout(() => {
      handleSelection();
    }, 10);
  }

  function onMouseDown(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.closest(`#${BUBBLE_ID}`)) {
      return;
    }
    removeBubble();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      removeBubble();
    }
  }

  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("mousedown", onMouseDown);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("scroll", removeBubble, { passive: true });

  return {
    destroy: () => {
      removeBubble();
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", removeBubble);
    },
  };
}
