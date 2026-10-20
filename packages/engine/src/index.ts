import type { ChunkOptions, ChunkResult } from "./types.js";
import { callChatCompletions } from "./client.js";
import { parseChunkResponse } from "./parse.js";
import { ChunkEngineError } from "./errors.js";

export * from "./types.js";
export { ChunkEngineError } from "./errors.js";

/**
 * 意群切分入口。
 *
 * 输入一段英文文本 + LLM Provider 配置，输出带原文 offset 的意群切分结果。
 * 失败时抛出 ChunkEngineError（携带 code/retryable），不抛出笼统的 Error。
 * 见 docs/意群切分Engine设计方案.md 第 4 节。
 */
export async function chunk(text: string, options: ChunkOptions): Promise<ChunkResult> {
  if (text.trim().length === 0) {
    throw new ChunkEngineError("INVALID_RESPONSE", "输入文本为空", false);
  }

  const startedAt = Date.now();
  const { content, usage } = await callChatCompletions(
    text,
    options.provider,
    { granularity: options.granularity },
    options.signal
  );
  const chunks = parseChunkResponse(content, text);

  return {
    chunks,
    meta: {
      providerUsed: options.provider.model,
      latencyMs: Date.now() - startedAt,
      tokenUsage: usage,
    },
  };
}
