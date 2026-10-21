import type { Chunk } from "./types.js";
import { ChunkEngineError } from "./errors.js";

/**
 * 把 LLM 返回的 JSON 字符串解析成 chunk 文本数组，再定位回原文 offset。
 *
 * 分两级定位，**输出的 chunks 永远满足「拼回等于原文」**（engine 硬契约）：
 *
 * 1. **精确查找**（快路径、默认路径）：从游标位置顺序查找每个 chunk 文本。
 *    对遵守「只插切点、不改字符」的模型（云端 deepseek 等）这就是全部。
 *
 * 2. **切点吸附**（降级路径）：当精确查找失败时，把模型输出退化为「切点提示」，
 *    在原文里对齐到最近的词边界，然后**从原文切片**。
 *
 * 为什么需要第 2 级：实测并非所有模型都守约。
 * - Gemini Nano 会把切分处的空格吞掉：`["She put","the keys"]` 拼出 `"She putthe"`；
 * - 云端 deepseek 也曾在一次 297 字请求里丢字符。
 *
 * 第 2 级只在「模型没有改动任何非空白字符」时才生效（见 `snapToWordBoundaries` 的
 * 前置校验）。模型若真的编造/改写了内容，仍然报 INVALID_RESPONSE——吸附只能修
 * 空白差异，不能修内容差异。
 */
export function parseChunkResponse(rawContent: string, originalText: string): Chunk[] {
  const chunkTexts = extractChunkTexts(rawContent).filter((t) => t.length > 0);

  if (chunkTexts.length === 0) {
    throw new ChunkEngineError("INVALID_RESPONSE", "切分结果为空", false);
  }

  const exact = tryLocateExactly(chunkTexts, originalText);
  if (exact) return exact;

  const snapped = snapToWordBoundaries(chunkTexts, originalText);
  if (snapped) return snapped;

  throw new ChunkEngineError(
    "INVALID_RESPONSE",
    `无法在原文中定位切分片段（模型可能改写了内容）: "${chunkTexts[0]}"`,
    false
  );
}

/**
 * 精确查找：每个 chunk 都是原文的连续子串，且按顺序出现，**并且拼起来覆盖整段原文**。
 * 失败返回 null（不抛错），交给吸附路径。
 *
 * 最后那条“覆盖整段”的检查是必需的：模型吞掉空格时，
 * ["She put","the keys",...] 里的每一项**单独看都存在于原文**，
 * 子串查找全部成功，但拼出来是 "She putthe keys..."，丢了空格。
 * 早期版本就是这样静默通过了，产出的高亮与原文对不上。
 */
function tryLocateExactly(chunkTexts: string[], originalText: string): Chunk[] | null {
  const chunks: Chunk[] = [];
  let cursor = 0;

  for (const chunkText of chunkTexts) {
    const foundAt = originalText.indexOf(chunkText, cursor);
    if (foundAt === -1) return null;
    chunks.push({
      text: chunkText,
      startOffset: foundAt,
      endOffset: foundAt + chunkText.length,
    });
    cursor = foundAt + chunkText.length;
  }

  // 必须覆盖整段原文，否则属于「模型输出与原文有空白差异」的情形，需走吸附
  if (chunks.map((c) => c.text).join("") !== originalText) return null;

  return chunks;
}

/**
 * 切点吸附：把模型输出当作「切点提示」，在原文里寻找最接近的合法词边界。
 *
 * 前置校验（关键）：模型输出**去掉所有空白**后必须与原文去空白后完全一致。
 * 这条校验把「只是空白处理不当」和「模型改写了内容」区分开：
 * 前者可以修复，后者必须报错。没有这条校验，吸附会掩盖真正的幻觉——
 * 因为它总是能从不含错误的原文里切出东西来。
 */
function snapToWordBoundaries(chunkTexts: string[], originalText: string): Chunk[] | null {
  const modelStripped = chunkTexts.join("").replace(/\s+/g, "");
  const originalStripped = originalText.replace(/\s+/g, "");

  if (modelStripped.length === 0 || modelStripped !== originalStripped) {
    return null;
  }

  // 原文中每个非空白字符的起始位置：用来把「已消费的非空白字符数」换算回原文位置
  const nonSpaceStarts: number[] = [];
  for (let i = 0; i < originalText.length; i++) {
    if (!/\s/.test(originalText[i])) nonSpaceStarts.push(i);
  }
  if (nonSpaceStarts.length !== originalStripped.length) return null;

  const cuts: number[] = [];
  let consumed = 0;

  for (let i = 0; i < chunkTexts.length - 1; i++) {
    consumed += chunkTexts[i].replace(/\s+/g, "").length;
    if (consumed <= 0 || consumed >= nonSpaceStarts.length) continue;

    const approx = nonSpaceStarts[consumed];
    const floor = cuts.length > 0 ? cuts[cuts.length - 1] : 0;
    const snapped = findNearestWordStart(originalText, approx, floor);
    if (snapped !== -1) cuts.push(snapped);
  }

  if (cuts.length === 0) {
    // 模型只给了一个「切点提示」都没落下：退化为整段一个 chunk，仍然无损
    return [{ text: originalText, startOffset: 0, endOffset: originalText.length }];
  }

  return sliceAtCuts(originalText, cuts);
}

/** 词边界附近最多允许偏移的字符数。超过说明模型输出已严重偏离。 */
const MAX_SNAP_SHIFT = 24;

/**
 * 在 approx 附近找最近的词首位置：
 * `p` 满足「原文[p-1] 是空白（或 p 是 0）」且「原文[p] 不是空白」。
 *
 * 从近到远搜索，保证吸附幅度最小——吸附越少，越接近模型原本的意图。
 */
function findNearestWordStart(originalText: string, approx: number, floor: number): number {
  const isWordStart = (p: number): boolean =>
    p > 0 &&
    p < originalText.length &&
    /\s/.test(originalText[p - 1]) &&
    !/\s/.test(originalText[p]);

  for (let d = 0; d <= MAX_SNAP_SHIFT; d++) {
    const candidates = d === 0 ? [approx] : [approx - d, approx + d];
    for (const p of candidates) {
      if (p > floor && isWordStart(p)) return p;
    }
  }
  return -1;
}

/** 按升序切点把原文切片，保留所有字符（无损） */
function sliceAtCuts(text: string, cuts: number[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 0;

  for (const cut of cuts) {
    chunks.push({ text: text.slice(cursor, cut), startOffset: cursor, endOffset: cut });
    cursor = cut;
  }
  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), startOffset: cursor, endOffset: text.length });
  }

  return chunks.filter((c) => c.text.length > 0);
}

function extractChunkTexts(rawContent: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonPayload(rawContent));
  } catch {
    throw new ChunkEngineError("INVALID_RESPONSE", "响应内容不是合法 JSON", false);
  }

  const chunks = (parsed as any)?.chunks;
  if (!Array.isArray(chunks) || !chunks.every((c) => typeof c === "string")) {
    throw new ChunkEngineError("INVALID_RESPONSE", "响应 JSON 中缺少合法的 chunks 字符串数组", false);
  }

  return chunks;
}

/**
 * 部分模型即使要求了 json_object 也可能在前后包裹 ```json 代码块。
 * 实测 Gemini Nano 必定包裹，所以这不是「可能」而是「常见」。
 */
function extractJsonPayload(rawContent: string): string {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1] : trimmed;
}
