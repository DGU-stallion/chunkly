import type { Chunk } from "./types.js";
import { ChunkEngineError } from "./errors.js";

/**
 * 把 LLM 返回的 JSON 字符串解析成 chunk 文本数组，再定位回原文 offset。
 *
 * 定位算法：从原文的当前游标位置开始，顺序查找每个 chunk 文本的下一次出现。
 * 这保证了：
 * - 不依赖 LLM 给出的数字 offset（LLM 不擅长精确数数字符位置）
 * - 只做精确子串查找，不做模糊匹配，避免误定位
 * - 如果 LLM 改写/复述了文本（不是原文子串），会在这里被识别为 INVALID_RESPONSE
 */
export function parseChunkResponse(rawContent: string, originalText: string): Chunk[] {
  const chunkTexts = extractChunkTexts(rawContent);

  const chunks: Chunk[] = [];
  let cursor = 0;

  for (const chunkText of chunkTexts) {
    if (chunkText.length === 0) {
      continue;
    }
    const foundAt = originalText.indexOf(chunkText, cursor);
    if (foundAt === -1) {
      throw new ChunkEngineError(
        "INVALID_RESPONSE",
        `无法在原文中定位切分片段: "${chunkText}"`,
        false
      );
    }
    chunks.push({
      text: chunkText,
      startOffset: foundAt,
      endOffset: foundAt + chunkText.length,
    });
    cursor = foundAt + chunkText.length;
  }

  if (chunks.length === 0) {
    throw new ChunkEngineError("INVALID_RESPONSE", "切分结果为空", false);
  }

  return chunks;
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
 * 部分模型即使要求了 json_object 也可能在前后包裹 ```json 代码块，
 * 这里做最基础的剥离，不做进一步的模糊修复。
 */
function extractJsonPayload(rawContent: string): string {
  const trimmed = rawContent.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fencedMatch ? fencedMatch[1] : trimmed;
}
