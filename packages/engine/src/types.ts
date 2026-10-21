/**
 * Engine 对外类型定义。
 * 详见 docs/意群切分Engine设计方案.md 第 4.2 节。
 */

export interface ProviderConfig {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface ChunkOptions {
  provider: ProviderConfig;
  granularity?: "fine" | "coarse";
  /**
   * 推理强度。传 "off" 可关掉 thinking——对切分这种任务质量无损，但延迟直接减半。
   * 实测（CommandCode / deepseek-v4.1-flash）：off 1967ms / 0 reasoning tok；
   * 默认 3974ms / 303 reasoning tok。
   * 注意：各 Provider 支持的取值不同，不支持的值会直接 400（如 GLM 只支持 low/medium/high）。
   */
  reasoningEffort?: "off" | "low" | "medium" | "high";
  /** 关闭分段并发（默认开启）。用于测试或 Provider 并发额度极低的场景。 */
  disableConcurrency?: boolean;
  signal?: AbortSignal;
}

export interface Chunk {
  text: string;
  startOffset: number;
  endOffset: number;
}

export type ErrorCode =
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NETWORK_ERROR";

export interface ChunkError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export interface ChunkResult {
  chunks: Chunk[];
  meta: {
    providerUsed: string;
    latencyMs: number;
    tokenUsage: { prompt: number; completion: number };
    /** 本次切分实际拆成了几段并发请求（1 表示单次请求） */
    segmentCount: number;
  };
}
