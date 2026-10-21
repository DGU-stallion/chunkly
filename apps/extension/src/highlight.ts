/**
 * 高亮渲染。
 *
 * `computeSegments` 是纯逻辑（可单测）；`applyHighlight` / `undoHighlight` 操作真实 DOM。
 *
 * 硬约束（ADR-0001）：**高亮不得销毁宿主页面原有的文本节点**。
 * 早期实现用 `range.deleteContents() + insertNode()` 整块替换选区内容，会把原始
 * Text 节点删掉——后果是无法撤销，且让 React/Vue 这类受控渲染框架持有的节点引用失效。
 *
 * 现在的做法：把文本节点按 chunk 边界 `splitText()` 切开，再用 `<span>` 包裹目标片段。
 * 文本节点本身始终留在 DOM 里，因此撤销可以真正无损。
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

/** 一个文本节点里需要被包裹的片段（相对于该节点 data 的偏移） */
interface Piece {
  offset: number;
  length: number;
  chunkIndex: number;
}

/** 一个文本节点在选区里的占位信息 */
interface CoveredNode {
  node: Text;
  /** 该节点在**选区坐标系**里的起始 offset */
  startOffset: number;
  /** 该节点在**自身 data** 里的起始位置（部分选区时 > 0） */
  inNodeFrom: number;
}

/**
 * 把「全文 offset」的 segment 列表映射成「每个文本节点内部的片段」。
 *
 * 两个坐标系必须区分清楚，否则部分选区会整体错位：
 * - segment 用的是**选区坐标系**（从选区起点算）；
 * - splitText 用的是**节点自身坐标系**（从 node.data[0] 算）。
 */
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
          const pieces = plan.get(node) ?? [];
          pieces.push({
            // 选区坐标 -> 节点坐标
            offset: inNodeFrom + (overlapStart - nodeStart),
            length: overlapEnd - overlapStart,
            chunkIndex: segment.chunkIndex,
          });
          plan.set(node, pieces);
        }
      }
    }
    segStart = segEnd;
  }

  return plan;
}

/**
 * 在真实 DOM 上应用高亮。
 *
 * @param range 用户选区（决定要处理哪棵子树）
 * @param fullText 选区文本（chunk offset 的坐标系）
 * @param chunks engine 返回的意群
 */
export function applyHighlight(range: Range, fullText: string, chunks: Chunk[]): void {
  const segments = computeSegments(fullText, chunks);
  if (segments.length === 0) return;

  const covered = collectTextNodes(range);
  if (covered.length === 0) return;

  const plan = planPieces(covered, segments);

  for (const [node, pieces] of plan) {
    // 从后往前处理：每次 splitText 只影响该片段之后的部分，
    // 因此前面的 offset 始终有效，不需要反复重算。
    for (let i = pieces.length - 1; i >= 0; i--) {
      wrapPiece(node, pieces[i]);
    }
  }
}

/**
 * 收集 Range 覆盖的所有文本节点，按文档顺序，并记录每个节点在
 * **选区坐标系**里的起始 offset。
 *
 * 关键点：部分选区时，首个/末个文本节点只有一部分在选区内。
 * 早期实现直接用 `node.data.length` 累加，导致选区从段中间开始时
 * 所有 offset 都往前错位（实测：选中 "CCC DDD" 却高亮了段首的 "AAA BBB"）。
 */
function collectTextNodes(range: Range): CoveredNode[] {
  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;
  if (!container) return [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const out: CoveredNode[] = [];
  let acc = 0;

  let current = walker.nextNode() as Text | null;
  while (current) {
    if (current.data.length > 0 && range.intersectsNode(current)) {
      const from = current === range.startContainer ? range.startOffset : 0;
      const to = current === range.endContainer ? range.endOffset : current.data.length;

      if (to > from) {
        out.push({ node: current, startOffset: acc, inNodeFrom: from });
        acc += to - from;
      }
    }
    current = walker.nextNode() as Text | null;
  }
  return out;
}

/**
 * 用 span 包裹一个文本节点内的 [offset, offset+length)，不删除任何文本节点。
 *
 * @param baseOffset 该节点在选区坐标系里的起点。piece.offset 是相对节点自身 data 的偏移。
 */
function wrapPiece(node: Text, piece: Piece): void {
  // 先切出目标片段之后的部分
  if (piece.offset + piece.length < node.data.length) {
    node.splitText(piece.offset + piece.length);
  }
  // 再把目标片段之前的部分切走，剩下的 node 就是目标片段
  const target = piece.offset > 0 ? node.splitText(piece.offset) : node;

  const span = document.createElement("span");
  span.className = `${HIGHLIGHT_CLASS_PREFIX} ${HIGHLIGHT_CLASS_PREFIX}-${
    piece.chunkIndex % PALETTE_SIZE
  }`;

  target.parentNode?.insertBefore(span, target);
  span.appendChild(target);
}

/**
 * 撤销容器内所有 Chunkly 高亮：移除 span 并 normalize，使被切开的文本节点重新合并。
 *
 * 因为 applyHighlight 从未删除过文本节点，这一步是真正无损的。
 */
export function undoHighlight(container: ParentNode): void {
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
 * 只撤销与给定 range 相交的高亮，保留页面上其他位置的高亮。
 *
 * 为什么需要它：切分第二段时不能清掉第一段。意群辅助的用法就是逐段读、
 * 回头对，清空整页等于强迫用户只能看一段（这是用户的真实反馈）。
 * 快捷键与右键菜单里的「清除高亮」仍用 undoHighlight(document.body) 整页清。
 */
export function undoHighlightInRange(range: Range): void {
  const spans = Array.from(document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS_PREFIX}`)).filter(
    (span) => range.intersectsNode(span)
  );
  if (spans.length === 0) return;

  const parents = unwrapSpans(spans);
  parents.forEach((p) => p.normalize());
}

/**
 * 把 span 的子节点（原始文本节点）挪回原位并删掉空 span，返回受影响的父节点。
 *
 * 不在这里 normalize：同一父节点下多个 span 都拆完后只需合一次，
 * 边拆边 normalize 会把后面还没处理的 span 里的节点搅乱。
 */
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
