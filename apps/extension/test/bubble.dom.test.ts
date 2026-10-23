import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  shouldShowBubble,
  computeBubblePosition,
  createBubbleElement,
  setupBubbleTrigger,
} from "../src/bubble.js";

describe("shouldShowBubble 判定选区文本是否值得触发 Chunk", () => {
  it("空白或空字符不触发", () => {
    expect(shouldShowBubble("")).toBe(false);
    expect(shouldShowBubble("   \n\t ")).toBe(false);
  });

  it("过短的文本（少于3字符）不触发", () => {
    expect(shouldShowBubble("a")).toBe(false);
    expect(shouldShowBubble("to")).toBe(false);
  });

  it("纯数字或纯标点不触发", () => {
    expect(shouldShowBubble("123456")).toBe(false);
    expect(shouldShowBubble("...???")).toBe(false);
    expect(shouldShowBubble("123.45")).toBe(false);
  });

  it("包含英文单词且长度 >= 3 触发", () => {
    expect(shouldShowBubble("natural language")).toBe(true);
    expect(shouldShowBubble("the")).toBe(true);
    expect(shouldShowBubble("AI model")).toBe(true);
  });
});

describe("computeBubblePosition 坐标计算", () => {
  it("一般情况下位于选区上方居中", () => {
    const rect = {
      top: 100,
      bottom: 120,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
    } as DOMRect;

    const pos = computeBubblePosition(rect, 0, 0, 1000, 800);
    // top 应该在 rect.top 上方（约 -36px 到 -40px）
    expect(pos.top).toBeLessThan(rect.top);
    // 气泡的中心点应该对齐选区的横向中心点
    const bubbleCenter = pos.left + 148 / 2;
    expect(bubbleCenter).toBeCloseTo(150, 0);
  });

  it("当靠近屏幕顶部时自动翻转到下方", () => {
    const rect = {
      top: 15,
      bottom: 35,
      left: 100,
      right: 200,
      width: 100,
      height: 20,
    } as DOMRect;

    const pos = computeBubblePosition(rect, 0, 0, 1000, 800);
    // 顶部空间不够，翻转到选区下方
    expect(pos.top).toBeGreaterThan(rect.bottom);
  });

  it("横向坐标被 clamp 在视口内，不超出边缘", () => {
    const rectRightEdge = {
      top: 100,
      bottom: 120,
      left: 950,
      right: 990,
      width: 40,
      height: 20,
    } as DOMRect;

    const pos = computeBubblePosition(rectRightEdge, 0, 0, 1000, 800);
    expect(pos.left + 80).toBeLessThanOrEqual(1000);
  });
});

describe("createBubbleElement 创建 DOM 元素", () => {
  it("创建带有指定 class 与文字/图标的 button", () => {
    const onClick = vi.fn();
    const el = createBubbleElement(onClick);

    expect(el.id).toBe("chunkly-bubble-trigger");
    expect(el.textContent).toContain("Chunk");

    el.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("mousedown 时阻止默认事件以防止选区失焦", () => {
    const el = createBubbleElement(vi.fn());
    const mousedownEvent = new MouseEvent("mousedown", { cancelable: true });
    el.dispatchEvent(mousedownEvent);
    expect(mousedownEvent.defaultPrevented).toBe(true);
  });

  it("支持传入 { onChunk, onSpeak } 分别触发切分与朗读", () => {
    const onChunk = vi.fn();
    const onSpeak = vi.fn();
    const el = createBubbleElement({ onChunk, onSpeak });

    const chunkBtn = el.querySelector("#chunkly-btn-chunk") as HTMLElement;
    const speakBtn = el.querySelector("#chunkly-btn-speak") as HTMLElement;

    expect(chunkBtn).not.toBeNull();
    expect(speakBtn).not.toBeNull();

    chunkBtn.click();
    expect(onChunk).toHaveBeenCalledTimes(1);
    expect(onSpeak).toHaveBeenCalledTimes(0);

    speakBtn.click();
    expect(onSpeak).toHaveBeenCalledTimes(1);
  });
});

describe("setupBubbleTrigger 页面事件联动", () => {
  beforeEach(() => {
    document.body.innerHTML = '<p id="para">The quick brown fox jumps over the lazy dog.</p>';
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("当用户选中文本且触发 mouseup 时展示气泡，点击后触发回调并清除气泡", async () => {
    const onTrigger = vi.fn();
    const handle = setupBubbleTrigger({
      onTrigger,
      isEnabled: () => true,
    });

    const para = document.getElementById("para")!;
    const range = document.createRange();
    range.selectNodeContents(para);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    // Mock getBoundingClientRect on Range
    range.getBoundingClientRect = () =>
      ({
        top: 100,
        bottom: 120,
        left: 100,
        right: 300,
        width: 200,
        height: 20,
      }) as DOMRect;

    // 派发 mouseup
    document.dispatchEvent(new MouseEvent("mouseup"));

    // 等待 15ms（setupBubbleTrigger 有 10ms 延迟）
    await new Promise((r) => setTimeout(r, 20));

    const bubble = document.getElementById("chunkly-bubble-trigger");
    expect(bubble).not.toBeNull();

    // 点击气泡
    bubble?.click();

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(document.getElementById("chunkly-bubble-trigger")).toBeNull();

    handle.destroy();
  });

  it("当 isEnabled 返回 false 时不展示气泡", async () => {
    const onTrigger = vi.fn();
    const handle = setupBubbleTrigger({
      onTrigger,
      isEnabled: () => false,
    });

    const para = document.getElementById("para")!;
    const range = document.createRange();
    range.selectNodeContents(para);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    document.dispatchEvent(new MouseEvent("mouseup"));
    await new Promise((r) => setTimeout(r, 20));

    expect(document.getElementById("chunkly-bubble-trigger")).toBeNull();
    handle.destroy();
  });
});

