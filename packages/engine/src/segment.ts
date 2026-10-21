/**
 * 把长文本切成可并发请求的片段（segment）。
 *
 * 核心洞察：**句末标点永远是合法的意群边界**。因此只要在句子边界处拆段，
 * 并发后拼回去的结果与整段一次性请求**在语义上等价**——不会把一个意群从中间切开。
 *
 * 这一点很重要：如果按固定字符数切，就会把 "argued that the results" 从中间斩断，
 * LLM 每段只能看到半句，切分质量必然下降。所以这里只认句子边界。
 *
 * 不接触网络、不接触 DOM，方便单测。
 */

export interface TextSegment {
  /** 在整个原文中的起始位置 */
  startOffset: number;
  /** 在整个原文中的结束位置（不含） */
  endOffset: number;
  text: string;
}

/** 句末标点 + 其后的引号/括号 + 空白。故意保守：只在这些位置断句。 */
const SENTENCE_END = /([.!?…]+["'”’)\]]*)(\s+)/g;

/**
 * 按句子边界把文本切成若干段，每段的长度尽量接近 maxChars，
 * 但**只在句子边界处切**，不会写出比 maxChars 大很多的段（除非单句本身超长）。
 *
 * 单句超长（如一段没有句号的流式文本）时退化为整段返回——宁可慢，也不切断意群。
 */
export function splitIntoSegments(text: string, maxChars: number): TextSegment[] {
  if (text.length <= maxChars) {
    return text.length === 0 ? [] : [{ startOffset: 0, endOffset: text.length, text }];
  }

  // 找出所有候选切点（句末标点之后的第一个字符位置）
  const boundaries: number[] = [];
  SENTENCE_END.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SENTENCE_END.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }

  if (boundaries.length === 0) {
    // 没有句子边界可用，只能整段发（或按 maxChars 硬切会破坏意群，这里选择不切）
    return [{ startOffset: 0, endOffset: text.length, text }];
  }

  const segments: TextSegment[] = [];
  let segStart = 0;

  for (const boundary of boundaries) {
    const segLength = boundary - segStart;
    if (segLength >= maxChars) {
      segments.push({
        startOffset: segStart,
        endOffset: boundary,
        text: text.slice(segStart, boundary),
      });
      segStart = boundary;
    }
  }
  // 收尾
  if (segStart < text.length) {
    segments.push({
      startOffset: segStart,
      endOffset: text.length,
      text: text.slice(segStart),
    });
  }

  return segments;
}

/**
 * 把各段的切分结果拼回全局。
 *
 * 段的偏移是相对该段起点的，这里平移回原文坐标。
 * 段之间可能有未覆盖的空隙（当某段末的空白没被任何 chunk 包含时），补成 chunk，
 * 保证「所有 chunk 拼起来 == 原文」这一契约不被并发破坏。
 */
export function mergeSegmentChunks(
  segments: Array<{ segment: TextSegment; chunks: Array<{ text: string; startOffset: number; endOffset: number }> }>,
  originalText: string
): Array<{ text: string; startOffset: number; endOffset: number }> {
  const merged: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  let cursor = 0;

  for (const { segment, chunks } of segments) {
    // 段之间（或段之前）的空隙：原样保留，不高亮但也不丢字
    if (segment.startOffset > cursor) {
      merged.push({
        text: originalText.slice(cursor, segment.startOffset),
        startOffset: cursor,
        endOffset: segment.startOffset,
      });
      cursor = segment.startOffset;
    }

    for (const c of chunks) {
      const startOffset = segment.startOffset + c.startOffset;
      const endOffset = segment.startOffset + c.endOffset;
      // 段内也可能有空隙（LLM 返回的 offset 未覆盖整段）
      if (startOffset > cursor) {
        merged.push({
          text: originalText.slice(cursor, startOffset),
          startOffset: cursor,
          endOffset: startOffset,
        });
      }
      merged.push({ text: c.text, startOffset, endOffset });
      cursor = endOffset;
    }
    // 注意：**不要**把 cursor 推到 segment.endOffset。
    // 段末的空白（句间空格）属于原文但不属于任何 chunk，由下一段的空隙补齐处理；
    // 如果在这里直接跳过去，这些空白会被丢弃，破坏「拼起来等于原文」的契约。
  }

  if (cursor < originalText.length) {
    merged.push({
      text: originalText.slice(cursor),
      startOffset: cursor,
      endOffset: originalText.length,
    });
  }

  return absorbWhitespaceChunks(merged);
}

/**
 * 把纯空白的 chunk 合并进相邻 chunk，避免高亮层出现只含空格的色块。
 * engine 的 prompt 契约本来就要求「空白包含在某个 chunk 里」，
 * 并发拼段后这个契约会被破坏，这里重新满足它。
 */
function absorbWhitespaceChunks<T extends { text: string; startOffset: number; endOffset: number }>(
  chunks: T[]
): T[] {
  const out: T[] = [];

  for (const c of chunks) {
    const prev = out[out.length - 1];

    if (c.text.trim().length === 0) {
      if (prev) {
        // 纯空白并入前一个 chunk：startOffset 不变，endOffset 延伸
        out[out.length - 1] = {
          ...prev,
          text: prev.text + c.text,
          endOffset: c.endOffset,
        } as T;
      } else {
        out.push({ ...c });
      }
      continue;
    }

    if (prev && prev.text.trim().length === 0) {
      // 前一个是悬空的空白块（文本开头就是空白），并到当前 chunk 头部
      out[out.length - 1] = {
        ...c,
        text: prev.text + c.text,
        startOffset: prev.startOffset,
      } as T;
      continue;
    }

    out.push({ ...c });
  }

  return out;
}
