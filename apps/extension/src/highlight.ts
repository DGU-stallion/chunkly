/**
 * 高亮渲染：将意群切分结果映射到网页 DOM。
 *
 * 1. 优先采用现代 Web 标准：CSS Custom Highlight API（无 DOM 侵入）；
 * 2. 传统 DOM 回退模式：splitText + span 包裹（ADR-0001 路径，不销毁原始文本）；
 * 3. 严格守卫「无损」契约与「零认知干扰」：不强加冗余手柄，专注于沉浸式阅读。
 */
import type { Chunk } from "@chunkly/engine";

export interface Segment {
  text: string;
  chunkIndex: number | null;
}

export const PALETTE_SIZE = 4;
export const HIGHLIGHT_CLASS_PREFIX = "chunkly-chunk";
export const ACTIVE_CLASS = "chunkly-chunk-active";

/**
 * 设置当前发音激活的意群（卡拉OK同步高亮）。
 * @param container 容器元素
 * @param chunkIndex 激活的意群下标，传 null 清除全部激活状态
 * @param scopeId 可选的作用域实例 ID，只激活该段落内的意群，绝不波及其他已切分段落
 */
export function setActiveHighlightChunk(
  container: ParentNode,
  chunkIndex: number | null,
  scopeId?: string | null
): void {
  // 1. CSS Custom Highlight API 模式
  if (isHighlightApiSupported()) {
    const registry = getHighlightRegistry();
    const HighlightCtor = getHighlightConstructor();
    if (registry) {
      if (chunkIndex === null) {
        registry.delete("chunkly-active");
      } else {
        const activeRanges = activeHighlightRecords
          .filter(
            (r) => r.chunkIndex === chunkIndex && (!scopeId || r.scopeId === scopeId)
          )
          .map((r) => r.range);
        if (activeRanges.length > 0 && HighlightCtor) {
          const highlight = new HighlightCtor(...activeRanges);
          registry.set("chunkly-active", highlight);
        } else {
          registry.delete("chunkly-active");
        }
      }
    }
  }

  // 2. DOM span 模式
  const spans = Array.from(
    container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS_PREFIX}`)
  );
  for (const span of spans) {
    const idx = span.dataset.chunkIndex ? parseInt(span.dataset.chunkIndex, 10) : -1;
    const spanScope = span.dataset.scopeId;
    const matchesScope = !scopeId || spanScope === scopeId;

    if (chunkIndex !== null && idx === chunkIndex && matchesScope) {
      span.classList.add(ACTIVE_CLASS);
    } else {
      span.classList.remove(ACTIVE_CLASS);
    }
  }
}

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

interface Piece {
  offset: number;
  length: number;
  chunkIndex: number;
}

interface CoveredNode {
  node: Text;
  startOffset: number;
  inNodeFrom: number;
}

function addSanitizedPieces(
  targetPieces: Piece[],
  node: Text,
  rawOffset: number,
  rawLength: number,
  chunkIndex: number
): void {
  const rawText = node.data.slice(rawOffset, rawOffset + rawLength);
  if (!/[\r\n]/.test(rawText)) {
    // 单行文本：只要不是纯空白，就作为独立 piece
    if (rawText.trim().length > 0) {
      targetPieces.push({ offset: rawOffset, length: rawLength, chunkIndex });
    }
    return;
  }

  // 跨行/换行文本：严格按换行符切分，只提取包含真实英文字符的行内片段
  const lineRegex = /[^\r\n]+/g;
  let match: RegExpExecArray | null;
  while ((match = lineRegex.exec(rawText)) !== null) {
    const matchedLine = match[0];
    const matchStartInRaw = match.index;

    // 去除行末可能连带的尾部多余空白（避免高亮延伸到行尾空白处）
    const trimmedEnd = matchedLine.replace(/\s+$/, "");
    if (trimmedEnd.trim().length === 0) {
      continue;
    }

    // 如果片段开头有空白且紧贴换行，去除行首空白
    const leadingSpaces = trimmedEnd.match(/^\s*/)?.[0].length ?? 0;
    const cleanLength = trimmedEnd.length - leadingSpaces;
    if (cleanLength <= 0) {
      continue;
    }

    targetPieces.push({
      offset: rawOffset + matchStartInRaw + leadingSpaces,
      length: cleanLength,
      chunkIndex,
    });
  }
}

function planPieces(covered: CoveredNode[], segments: Segment[]): Map<Text, Piece[]> {
  const plan = new Map<Text, Piece[]>();

  let segStart = 0;
  for (const segment of segments) {
    const segEnd = segStart + segment.text.length;
    if (segment.chunkIndex !== null) {
      for (const { node, startOffset, inNodeFrom } of covered) {
        const nodeStart = startOffset;
        const nodeEnd = startOffset + (node.data.length - inNodeFrom);
        const overlapStart = Math.max(segStart, nodeStart);
        const overlapEnd = Math.min(segEnd, nodeEnd);
        if (overlapEnd > overlapStart) {
          const rawOffset = inNodeFrom + (overlapStart - nodeStart);
          const rawLength = overlapEnd - overlapStart;
          const pieces = plan.get(node) ?? [];
          addSanitizedPieces(pieces, node, rawOffset, rawLength, segment.chunkIndex);
          if (pieces.length > 0) {
            plan.set(node, pieces);
          }
        }
      }
    }
    segStart = segEnd;
  }

  for (const [, pieces] of plan) {
    pieces.sort((a, b) => a.offset - b.offset);
  }

  return plan;
}

function collectTextNodes(range: Range, fullText?: string): CoveredNode[] {
  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!container) return [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const out: CoveredNode[] = [];
  let acc = 0;
  let textSearchCursor = 0;

  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current.data.length > 0 && range.intersectsNode(current)) {
      const from = current === range.startContainer ? range.startOffset : 0;
      const to = current === range.endContainer ? range.endOffset : current.data.length;

      if (to > from) {
        const slice = current.data.slice(from, to);
        let nodeStartOffset = acc;
        if (typeof fullText === "string" && fullText.length > 0) {
          const found = fullText.indexOf(slice, textSearchCursor);
          if (found !== -1) {
            nodeStartOffset = found;
            textSearchCursor = found + slice.length;
          }
        }
        out.push({ node: current, startOffset: nodeStartOffset, inNodeFrom: from });
        acc += to - from;
      }
    }
    current = walker.nextNode() as Text | null;
  }
  return out;
}

interface HighlightRegistryLike {
  set(name: string, highlight: unknown): void;
  delete(name: string): boolean;
  clear(): void;
  has(name: string): boolean;
}

interface HighlightConstructorLike {
  new (...ranges: Range[]): unknown;
}

function getHighlightRegistry(): HighlightRegistryLike | null {
  if (typeof CSS !== "undefined" && "highlights" in CSS) {
    const reg = (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights;
    return reg ?? null;
  }
  return null;
}

function getHighlightConstructor(): HighlightConstructorLike | null {
  const g = globalThis as unknown as { Highlight?: HighlightConstructorLike };
  return g.Highlight ?? null;
}

/** 是否支持 CSS Custom Highlight API */
export function isHighlightApiSupported(): boolean {
  return getHighlightRegistry() !== null && getHighlightConstructor() !== null;
}

export interface HighlightRecord {
  range: Range;
  chunkIndex: number;
  highlightName: string;
  scopeId?: string;
}

let activeHighlightRecords: HighlightRecord[] = [];

function syncCssHighlights(): void {
  const css = getHighlightRegistry();
  const HighlightCtor = getHighlightConstructor();
  if (!css || !HighlightCtor) return;

  for (let i = 0; i < PALETTE_SIZE; i++) {
    const name = `chunkly-${i}`;
    const ranges = activeHighlightRecords
      .filter((r) => r.highlightName === name)
      .map((r) => r.range);

    if (ranges.length > 0) {
      css.set(name, new HighlightCtor(...ranges));
    } else {
      css.delete(name);
    }
  }
}

export function rangesOverlap(a: Range, b: Range): boolean {
  try {
    return (
      a.compareBoundaryPoints(Range.START_TO_END, b) > 0 &&
      a.compareBoundaryPoints(Range.END_TO_START, b) < 0
    );
  } catch {
    return false;
  }
}

/**
 * 在真实网页上应用高亮。
 *
 * @param range 用户划选区域
 * @param fullText 原文选区文本
 * @param chunks 意群切分列表
 * @param scopeId 可选的作用域实例 ID
 * @returns 最终生效的 scopeId
 */
export function applyHighlight(
  range: Range,
  fullText: string,
  chunks: Chunk[],
  scopeId?: string
): string {
  const actualScopeId =
    scopeId ?? `scope-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const segments = computeSegments(fullText, chunks);
  if (segments.length === 0) return actualScopeId;

  const covered = collectTextNodes(range, fullText);
  if (covered.length === 0) return actualScopeId;

  const plan = planPieces(covered, segments);

  // 1. 现代模式：CSS Custom Highlight API
  if (isHighlightApiSupported()) {
    for (const [node, pieces] of plan) {
      for (const piece of pieces) {
        const r = new Range();
        r.setStart(node, piece.offset);
        r.setEnd(node, piece.offset + piece.length);
        const name = `chunkly-${piece.chunkIndex % PALETTE_SIZE}`;
        activeHighlightRecords.push({
          range: r,
          chunkIndex: piece.chunkIndex,
          highlightName: name,
          scopeId: actualScopeId,
        });
      }
    }
    syncCssHighlights();
    return actualScopeId;
  }

  // 2. 回退模式：DOM 节点切割与 span 包裹（ADR-0001 路径）
  for (const [node, pieces] of plan) {
    for (let i = pieces.length - 1; i >= 0; i--) {
      wrapPiece(node, pieces[i], actualScopeId);
    }
  }
  return actualScopeId;
}

function wrapPiece(node: Text, piece: Piece, scopeId?: string): HTMLElement {
  if (piece.offset + piece.length < node.data.length) {
    node.splitText(piece.offset + piece.length);
  }
  const target = piece.offset > 0 ? node.splitText(piece.offset) : node;

  const span = document.createElement("span");
  span.className = `${HIGHLIGHT_CLASS_PREFIX} ${HIGHLIGHT_CLASS_PREFIX}-${
    piece.chunkIndex % PALETTE_SIZE
  }`;
  span.dataset.chunkIndex = String(piece.chunkIndex);
  if (scopeId) {
    span.dataset.scopeId = scopeId;
  }

  target.parentNode?.insertBefore(span, target);
  span.appendChild(target);
  return span;
}

/**
 * 撤销高亮：同时清理 CSS Custom Highlight 与 DOM span。
 */
export function undoHighlight(container: ParentNode): void {
  // 清理 CSS Custom Highlight
  if (isHighlightApiSupported()) {
    if (container === document.body || (container as Node).contains(document.body)) {
      activeHighlightRecords = [];
    } else {
      activeHighlightRecords = activeHighlightRecords.filter(
        (r) => !container.contains(r.range.commonAncestorContainer)
      );
    }
    syncCssHighlights();
    if ("CSS" in window && "highlights" in (window as any).CSS) {
      (window as any).CSS.highlights.delete("chunkly-active");
    }
  }

  // 清理 DOM span
  const spans = Array.from(
    container.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS_PREFIX}`)
  );
  if (spans.length === 0) return;

  const parents = unwrapSpans(spans);
  parents.forEach((p) => p.normalize());

  if (container instanceof Node) {
    container.normalize();
  }
}

/**
 * 只撤销与给定 range 相交的高亮，保留其他区域的高亮。
 */
export function undoHighlightInRange(range: Range): void {
  // 清理 CSS Custom Highlight
  if (isHighlightApiSupported()) {
    activeHighlightRecords = activeHighlightRecords.filter(
      (r) => !rangesOverlap(range, r.range)
    );
    syncCssHighlights();
  }

  // 清理 DOM span
  const spans = Array.from(
    document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS_PREFIX}`)
  ).filter((span) => range.intersectsNode(span));
  if (spans.length === 0) return;

  const parents = unwrapSpans(spans);
  parents.forEach((p) => p.normalize());
}

function unwrapSpans(spans: HTMLElement[]): Set<Node> {
  const parents = new Set<Node>();

  for (const span of spans) {
    const parent = span.parentNode;
    if (!parent) continue;
    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }
    parent.removeChild(span);
    parents.add(parent);
  }

  return parents;
}

export function getActiveHighlightRecords(): HighlightRecord[] {
  return activeHighlightRecords;
}

export function clearActiveHighlightRecords(): void {
  activeHighlightRecords = [];
  syncCssHighlights();
}
