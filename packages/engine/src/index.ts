import type { ChunkOptions, ChunkResult } from "./types.js";
import { callChatCompletions } from "./client.js";
import { parseChunkResponse } from "./parse.js";
import { ChunkEngineError, isRetryable } from "./errors.js";
import { splitIntoSegments, mergeSegmentChunks, type TextSegment } from "./segment.js";

export * from "./types.js";
export { ChunkEngineError } from "./errors.js";
export { splitIntoSegments } from "./segment.js";

/** 触发并发切分的最小长度（字符）。短文本单次请求更快，没必要并发。 */
const CONCURRENT_THRESHOLD_CHARS = 600;
/** 每段目标长度。实测每个请求固定开销约 1.8–2.5s，段太小并发收益被开销吃掉。 */
const SEGMENT_TARGET_CHARS = 400;
/** 最大并发数。实测直连 CommandCode 12 路并发零失败，取 6 留余量、也更贴合其他 Provider 的 RPM 限额。 */
const MAX_CONCURRENCY = 6;

/**
 * 限并发地图：最多同时跑 limit 个 worker，结果保持输入顺序。
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

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

  // 短文本：单次请求，走原来的路径
  const segments = splitIntoSegments(text, SEGMENT_TARGET_CHARS);
  const shouldGoConcurrent =
    segments.length > 1 && text.length >= CONCURRENT_THRESHOLD_CHARS && !options.disableConcurrency;

  if (!shouldGoConcurrent) {
    const { content, usage } = await callChatCompletions(
      text,
      options.provider,
      { granularity: options.granularity },
      options.signal,
      options.reasoningEffort
    );
    const chunks = parseChunkResponse(content, text);
    return {
      chunks,
      meta: {
        providerUsed: options.provider.model,
        latencyMs: Date.now() - startedAt,
        tokenUsage: usage,
        segmentCount: 1,
      },
    };
  }

  // 长文本：按句子边界拆段并发。句末标点永远是合法意群边界，
  // 因此拆段不会把意群从中间切开。
  const perSegment = await mapWithConcurrency(segments, MAX_CONCURRENCY, async (segment) => {
    const { content, usage } = await chunkSegmentWithRetry(segment, options);
    return { segment, chunks: parseChunkResponse(content, segment.text), usage };
  });

  const merged = mergeSegmentChunks(perSegment, text);

  return {
    chunks: merged,
    meta: {
      providerUsed: options.provider.model,
      latencyMs: Date.now() - startedAt,
      // 并发时 usage 分摊在各请求里，这里只统计主调度的累计值（各段合计）
      tokenUsage: sumUsage(perSegment),
      segmentCount: segments.length,
    },
  };
}

function sumUsage(
  results: Array<{ usage?: { prompt: number; completion: number } }>
): { prompt: number; completion: number } {
  return results.reduce(
    (acc, r) => ({
      prompt: acc.prompt + (r.usage?.prompt ?? 0),
      completion: acc.completion + (r.usage?.completion ?? 0),
    }),
    { prompt: 0, completion: 0 }
  );
}

/**
 * 单段请求 + 有界重试。
 *
 * 并发后单段失败会毁掉整篇文章的切分结果，所以这里做重试；
 * 重试策略挂在 engine 而不是应用层，是因为它针对的是「分段并发」这一
 * engine 内部机制带来的新故障面，不是通用的产品策略。
 */
async function chunkSegmentWithRetry(
  segment: TextSegment,
  options: ChunkOptions
): Promise<{ content: string; usage: { prompt: number; completion: number } }> {
  const maxAttempts = 2;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callChatCompletions(
        segment.text,
        options.provider,
        { granularity: options.granularity },
        options.signal,
        options.reasoningEffort
      );
    } catch (err) {
      lastError = err;
      // 只在可重试错误上重试；AUTH_FAILED / INVALID_RESPONSE 重试也没用
      if (!(err instanceof ChunkEngineError) || !isRetryable(err.code) || attempt === maxAttempts) {
        throw err;
      }
      // 指数退避 + 抖动，避免多段同时重试再次撞上限流
      await new Promise((r) => setTimeout(r, 300 * attempt + Math.random() * 200));
    }
  }

  throw lastError;
}
