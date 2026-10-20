import type { ProviderConfig } from "./types.js";
import { ChunkEngineError } from "./errors.js";
import { buildSystemPrompt, buildUserPrompt, type PromptGranularity } from "./prompt.js";

export interface LlmCallResult {
  content: string;
  usage: { prompt: number; completion: number };
}

/**
 * 调用 OpenAI 兼容协议的 /chat/completions 接口。
 * GLM、OpenAI、以及 Claude/Gemini 的兼容层都遵循这一协议（见设计文档 3.2 节）。
 */
export async function callChatCompletions(
  text: string,
  provider: ProviderConfig,
  promptOptions: PromptGranularity,
  signal?: AbortSignal
): Promise<LlmCallResult> {
  const url = joinUrl(provider.baseURL, "/chat/completions");

  const requestBody: Record<string, unknown> = {
    model: provider.model,
    messages: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(text, promptOptions) },
    ],
    temperature: 0,
    response_format: { type: "json_object" },
  };
  // GLM 系列模型默认开启深度思考（thinking），会导致简单任务也产生大量隐藏推理
  // token、显著拖慢响应速度。`thinking` 是智谱专有扩展字段，非 GLM 的 OpenAI 兼容层
  // （如 Gemini）会对未知字段做严格校验并直接拒绝整个请求（HTTP 400），因此只在
  // baseURL 命中 GLM 官方域名时才附加这个字段。
  if (isGlmProvider(provider.baseURL)) {
    requestBody.thinking = { type: "disabled" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal,
    });
  } catch (err) {
    throw mapNetworkError(err);
  }

  if (!response.ok) {
    throw mapHttpError(response.status, await safeReadText(response));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ChunkEngineError("INVALID_RESPONSE", "响应体不是合法 JSON", false);
  }

  return extractMessage(body);
}

function isGlmProvider(baseURL: string): boolean {
  try {
    return new URL(baseURL).hostname === "open.bigmodel.cn";
  } catch {
    return false;
  }
}

function joinUrl(baseURL: string, path: string): string {
  return baseURL.replace(/\/+$/, "") + path;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function mapNetworkError(err: unknown): ChunkEngineError {
  if (err instanceof Error && err.name === "AbortError") {
    return new ChunkEngineError("TIMEOUT", "请求被取消或超时", true);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new ChunkEngineError("NETWORK_ERROR", `网络请求失败: ${message}`, true);
}

function mapHttpError(status: number, bodyText: string): ChunkEngineError {
  if (status === 401 || status === 403) {
    return new ChunkEngineError("AUTH_FAILED", `鉴权失败 (HTTP ${status}): ${bodyText}`, false);
  }
  if (status === 429) {
    return new ChunkEngineError("RATE_LIMITED", `触发速率限制 (HTTP ${status}): ${bodyText}`, true);
  }
  if (status === 408) {
    return new ChunkEngineError("TIMEOUT", `请求超时 (HTTP ${status}): ${bodyText}`, true);
  }
  if (status >= 500) {
    return new ChunkEngineError(
      "SERVICE_UNAVAILABLE",
      `服务不可用 (HTTP ${status}): ${bodyText}`,
      true
    );
  }
  return new ChunkEngineError(
    "INVALID_RESPONSE",
    `意外的响应状态 (HTTP ${status}): ${bodyText}`,
    false
  );
}

function extractMessage(body: unknown): LlmCallResult {
  const content = (body as any)?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ChunkEngineError("INVALID_RESPONSE", "响应中缺少 choices[0].message.content", false);
  }
  const usage = (body as any)?.usage ?? {};
  return {
    content,
    usage: {
      prompt: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0,
      completion: typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0,
    },
  };
}
