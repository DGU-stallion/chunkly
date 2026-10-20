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
  };
}
