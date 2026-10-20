/**
 * 高亮渲染的核心纯逻辑：把 chunk 列表（原文 offset）转换成
 * 覆盖整段文本的 segment 列表（含 chunk 之间未覆盖的空隙）。
 * 不接触 DOM，方便单测；DOM 操作在 applyHighlight 中完成。
 */
import type { Chunk } from "@chunkly/engine";

export interface Segment {
  text: string;
  /** 落在某个 chunk 内则为该 chunk 在数组中的下标（用于交替配色），否则为 null（未覆盖的空隙，原样展示不高亮） */
  chunkIndex: number | null;
}

/**
 * 假设 chunks 已按 startOffset 升序、且互不重叠（engine 的顺序游标查找保证了这一点）。
 * 用于把整段文本拆分成「属于某个 chunk」或「不属于任何 chunk（空隙）」的连续片段。
 */
export function computeSegments(fullText: string, chunks: Chunk[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  chunks.forEach((c, index) => {
    if (c.startOffset > cursor) {
      segments.push({ text: fullText.slice(cursor, c.startOffset), chunkIndex: null });
    }
    segments.push({ text: fullText.slice(c.startOffset, c.endOffset), chunkIndex: index });
    cursor = c.endOffset;
  });

  if (cursor < fullText.length) {
    segments.push({ text: fullText.slice(cursor), chunkIndex: null });
  }

  return segments.filter((s) => s.text.length > 0);
}

const HIGHLIGHT_CLASS_PREFIX = "chunkly-chunk";
const PALETTE_SIZE = 4;

/**
 * 在真实 DOM 上应用高亮：用 Range 删除原选区内容，插入按 segment 拆分的 <span>。
 * 不做单元测试（依赖真实浏览器 Range/Selection 行为），核心拆分逻辑已在 computeSegments 中覆盖。
 */
export function applyHighlight(range: Range, fullText: string, chunks: Chunk[]): void {
  const segments = computeSegments(fullText, chunks);
  const fragment = document.createDocumentFragment();

  segments.forEach((segment) => {
    if (segment.chunkIndex === null) {
      fragment.appendChild(document.createTextNode(segment.text));
      return;
    }
    const span = document.createElement("span");
    span.className = `${HIGHLIGHT_CLASS_PREFIX} ${HIGHLIGHT_CLASS_PREFIX}-${
      segment.chunkIndex % PALETTE_SIZE
    }`;
    span.textContent = segment.text;
    fragment.appendChild(span);
  });

  range.deleteContents();
  range.insertNode(fragment);
}
