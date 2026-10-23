import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyHighlight,
  undoHighlight,
  undoHighlightInRange,
  isHighlightApiSupported,
  clearActiveHighlightRecords,
  getActiveHighlightRecords,
  setActiveHighlightChunk,
} from "../src/highlight.js";
import type { Chunk } from "@chunkly/engine";

// 模拟 Highlight 与 CSS.highlights
class MockHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
  [Symbol.iterator]() {
    return this.ranges[Symbol.iterator]();
  }
}

class MockHighlightRegistry {
  private map = new Map<string, MockHighlight>();

  set(name: string, highlight: MockHighlight): void {
    this.map.set(name, highlight);
  }

  get(name: string): MockHighlight | undefined {
    return this.map.get(name);
  }

  delete(name: string): boolean {
    return this.map.delete(name);
  }

  clear(): void {
    this.map.clear();
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  get size(): number {
    return this.map.size;
  }
}

describe("CSS Custom Highlight API 现代渲染引擎", () => {
  let mockRegistry: MockHighlightRegistry;

  beforeEach(() => {
    mockRegistry = new MockHighlightRegistry();
    (globalThis as any).Highlight = MockHighlight;
    (globalThis as any).CSS = { highlights: mockRegistry };
    clearActiveHighlightRecords();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    delete (globalThis as any).Highlight;
    delete (globalThis as any).CSS;
    clearActiveHighlightRecords();
  });

  it("正确识别 Highlight API 环境支持", () => {
    expect(isHighlightApiSupported()).toBe(true);
  });

  it("零 DOM 侵入：应用高亮时不切分原始文本节点，不插入 span", () => {
    const p = document.createElement("p");
    p.textContent = "The quick brown fox jumps over the lazy dog";
    document.body.appendChild(p);

    const initialChildCount = p.childNodes.length;
    const initialTextNode = p.firstChild as Text;

    const range = document.createRange();
    range.selectNodeContents(p);

    const chunks: Chunk[] = [
      { text: "The quick brown fox", startOffset: 0, endOffset: 19 },
      { text: " jumps over", startOffset: 19, endOffset: 30 },
      { text: " the lazy dog", startOffset: 30, endOffset: 43 },
    ];

    applyHighlight(range, p.textContent, chunks);

    // 关键断言：完全没有产生任何 span 标签！原始文本节点完全未被切断
    expect(p.querySelectorAll("span").length).toBe(0);
    expect(p.childNodes.length).toBe(initialChildCount);
    expect(p.firstChild).toBe(initialTextNode);
    expect(initialTextNode.data).toBe("The quick brown fox jumps over the lazy dog");

    // 关键断言：Ranges 被正确注册到 CSS.highlights 命名集合中
    expect(mockRegistry.has("chunkly-0")).toBe(true);
    expect(mockRegistry.has("chunkly-1")).toBe(true);
    expect(mockRegistry.has("chunkly-2")).toBe(true);

    const h0 = mockRegistry.get("chunkly-0")!;
    expect(h0.ranges.length).toBe(1);
    expect(h0.ranges[0].toString()).toBe("The quick brown fox");
  });

  it("全局撤销：能瞬间清空所有 Highlight ranges", () => {
    const p = document.createElement("p");
    p.textContent = "Although science progresses slowly, curiosity persists.";
    document.body.appendChild(p);

    const range = document.createRange();
    range.selectNodeContents(p);

    const chunks: Chunk[] = [
      { text: "Although science progresses slowly,", startOffset: 0, endOffset: 35 },
      { text: " curiosity persists.", startOffset: 35, endOffset: 55 },
    ];

    applyHighlight(range, p.textContent, chunks);
    expect(getActiveHighlightRecords().length).toBe(2);

    undoHighlight(document.body);
    expect(getActiveHighlightRecords().length).toBe(0);
    expect(mockRegistry.has("chunkly-0")).toBe(false);
    expect(mockRegistry.has("chunkly-1")).toBe(false);
  });

  it("局部撤销：撤销选区内的高亮，保留其他段落的高亮", () => {
    const p1 = document.createElement("p");
    p1.textContent = "First paragraph here.";
    const p2 = document.createElement("p");
    p2.textContent = "Second paragraph here.";
    document.body.appendChild(p1);
    document.body.appendChild(p2);

    const r1 = document.createRange();
    r1.selectNodeContents(p1);
    applyHighlight(r1, p1.textContent, [
      { text: "First paragraph", startOffset: 0, endOffset: 15 },
    ]);

    const r2 = document.createRange();
    r2.selectNodeContents(p2);
    applyHighlight(r2, p2.textContent, [
      { text: "Second paragraph", startOffset: 0, endOffset: 16 },
    ]);

    expect(getActiveHighlightRecords().length).toBe(2);

    // 只撤销 p1
    undoHighlightInRange(r1);

    const remaining = getActiveHighlightRecords();
    expect(remaining.length).toBe(1);
    expect(remaining[0].range.toString()).toBe("Second paragraph");
  });

  it("包含多段换行时，Highlight ranges 绝不覆盖 \\r 或 \\n 字符，仅覆盖真实文本", () => {
    const p1 = document.createElement("p");
    p1.textContent = "Line one here.";
    const p2 = document.createElement("p");
    p2.textContent = "Line two here.";
    document.body.appendChild(p1);
    document.body.appendChild(p2);

    const range = document.createRange();
    range.setStart(p1.firstChild!, 0);
    range.setEnd(p2.firstChild!, 14);

    const fullText = "Line one here.\n\nLine two here.";
    const chunks: Chunk[] = [
      { text: "Line one here.", startOffset: 0, endOffset: 14 },
      { text: "\n\nLine two here.", startOffset: 14, endOffset: 30 },
    ];

    applyHighlight(range, fullText, chunks);

    const records = getActiveHighlightRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record.range.toString()).not.toMatch(/[\r\n]/);
    }
    expect(records.map((r) => r.range.toString())).toEqual([
      "Line one here.",
      "Line two here.",
    ]);
  });

  it("在 Highlight API 模式下，setActiveHighlightChunk 带 scopeId 时仅将对应段落的 Range 加入 active 集合", () => {
    const p1 = document.createElement("p");
    p1.textContent = "Section A phrase.";
    const p2 = document.createElement("p");
    p2.textContent = "Section B phrase.";
    document.body.appendChild(p1);
    document.body.appendChild(p2);

    const r1 = document.createRange();
    r1.selectNodeContents(p1);
    applyHighlight(r1, p1.textContent, [{ text: "Section A phrase.", startOffset: 0, endOffset: 17 }], "scope-1");

    const r2 = document.createRange();
    r2.selectNodeContents(p2);
    applyHighlight(r2, p2.textContent, [{ text: "Section B phrase.", startOffset: 0, endOffset: 17 }], "scope-2");

    // 激活 scope-2 的 chunk 0
    setActiveHighlightChunk(document.body, 0, "scope-2");

    const activeHighlight = (window as any).CSS.highlights.get("chunkly-active");
    expect(activeHighlight).toBeDefined();
    const activeRanges = Array.from(activeHighlight as Set<Range>);
    expect(activeRanges).toHaveLength(1);
    expect(activeRanges[0].toString()).toBe("Section B phrase.");
  });
});
