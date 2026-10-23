import type { ProviderConfig } from "./types.js";
import { ChunkEngineError } from "./errors.js";
import { buildSystemPrompt, buildUserPrompt, type PromptGranularity } from "./prompt.js";

export interface LlmCallResult {
  content: string;
  usage: { prompt: number; completion: number };
}

/**
 * 单次请求的超时时间。
 *
 * 必须小于 Chrome 对扩展 service worker 的硬限制：官方文档明确写着
 * 「a fetch() response takes more than 30 seconds to arrive」时 SW 会被终止。
 * SW 一旦被杀，消息通道断开，用户看到的就是「切分失败」，而真正的
 * 原因（模型太慢）完全不可见。
 *
 * 取 25s 留 5s 余量：超时后我们主动中止并重试，比让 SW 被杀可控得多。
 * 实测踩坑：z-ai/glm-5.3-flash 处理 683 字文本曾跑到 43.8s，
 * 这种请求必然会被 SW 生命周期干掉。
 */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * 调用 OpenAI 兼容协议的 /chat/completions 接口。
 * GLM、OpenAI、以及 Claude/Gemini 的兼容层都遵循这一协议（见设计文档 3.2 节）。
 */
export async function callChatCompletions(
  text: string,
  provider: ProviderConfig,
  promptOptions: PromptGranularity,
  signal?: AbortSignal,
  reasoningEffort?: "off" | "low" | "medium" | "high"
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

  // 推理强度：切分是浅层句法任务，thinking 几乎不带来质量提升，却把延迟和 token 翻倍。
  // 显式关掉是性价比最高的一项调优（实测 3974ms -> 1967ms，reasoning token 303 -> 0）。
  // 不支持该参数的 Provider 会返回 400，调用方应只对自己确认过的 Provider 传值。
  // 注意：各 Provider 取值不同。CommandCode 的 deepseek 支持 "off"；
  // 而 GLM 只接受 low/medium/high，传 "off" 会 400。
  if (reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  } else if (isGlmProvider(provider.baseURL)) {
    // 智谱官方域名用专有的 thinking 字段关思考（response_format 之外的非标准字段，
    // 其他 Provider 会对未知字段严格校验并 400，所以只在 GLM 官方域名时附加）。
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
      // 超时中止必须由我们自己做，不能依赖 SW 生命周期：
      // SW 被杀时我们连错误都拿不到，只能看到通道断开。
      signal: combineSignals(signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
    });
  } catch (err) {
    throw mapNetworkError(err);
  }

  if (!response.ok) {
    const errorText = await safeReadText(response);

    // 弹性自愈 1：如果是 reasoning_effort 引起的 400，自动剔除该优化参数重试一次
    if (
      response.status === 400 &&
      requestBody.reasoning_effort &&
      (errorText.includes("reasoning_effort") || errorText.includes("unsupported_value"))
    ) {
      delete requestBody.reasoning_effort;
      try {
        const retryResp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: combineSignals(signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
        });
        if (retryResp.ok) {
          const body = await retryResp.json();
          return extractMessage(body);
        }
      } catch {
        // 重试失败时继续向下抛出原始错误
      }
    }

    // 弹性自愈 2：如果是 response_format 引起的 400（例如某些本地/开源网关不支持严格 json_object），剔除后重试
    if (
      response.status === 400 &&
      requestBody.response_format &&
      (errorText.includes("response_format") ||
        errorText.includes("json_object") ||
        errorText.includes("text.format"))
    ) {
      delete requestBody.response_format;
      try {
        const retryResp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: combineSignals(signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)),
        });
        if (retryResp.ok) {
          const body = await retryResp.json();
          return extractMessage(body);
        }
      } catch {
        // 继续向下抛
      }
    }

    throw mapHttpError(response.status, errorText);
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

/**
 * 合并外部 signal 与超时 signal：任一触发即中止。
 *
 * AbortSignal.any 在 Chrome 116+ 可用，但为兼容更早的环境做降级。
 */
function combineSignals(signal: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!signal) return timeout;

  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn([signal, timeout]);

  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted || timeout.aborted) {
    controller.abort();
    return controller.signal;
  }
  signal.addEventListener("abort", abort, { once: true });
  timeout.addEventListener("abort", abort, { once: true });
  return controller.signal;
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
  // 400 单独成一类。实测最常见的两个原因是「模型不支持某个参数」
  // （如 z-ai/glm-5.3-flash 收到 reasoning_effort="off" 会直接 400），
  // 以及「模型名不存在」。这两种都不是「解析失败」，笼统报成
  // INVALID_RESPONSE 会把排查方向彻底带偏——我本人就被这条提示误导过一轮。
  if (status === 400) {
    return new ChunkEngineError("BAD_REQUEST", `请求参数被拒绝 (HTTP 400): ${bodyText}`, false);
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
