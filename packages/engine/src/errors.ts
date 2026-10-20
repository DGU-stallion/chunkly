import type { ErrorCode } from "./types.js";

/**
 * Engine 统一错误类型。所有 chunk() 的失败路径都以此类抛出，
 * 插件侧可以用 err.code 做分支处理。
 */
export class ChunkEngineError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = "ChunkEngineError";
    this.code = code;
    this.retryable = retryable;
  }
}

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  "RATE_LIMITED",
  "TIMEOUT",
  "SERVICE_UNAVAILABLE",
  "NETWORK_ERROR",
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_CODES.has(code);
}
