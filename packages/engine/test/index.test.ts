import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chunk, ChunkEngineError } from "../src/index.js";
import type { ProviderConfig } from "../src/types.js";

const provider: ProviderConfig = {
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
  apiKey: "test-key",
  model: "glm-4.7-flash",
};

function mockFetchOnce(response: Partial<Response> & { jsonBody?: unknown; textBody?: string }) {
  const { jsonBody, textBody, ...rest } = response;
  const fakeResponse = {
    ok: rest.ok ?? true,
    status: rest.status ?? 200,
    json: async () => jsonBody,
    text: async () => textBody ?? "",
  } as Response;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse));
}

function openAiChatBody(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe("chunk 成功路径", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("能把 LLM 返回的 chunk 文本定位为原文 offset", async () => {
    const text = "Reading English in phrase chunks";
    mockFetchOnce({
      jsonBody: openAiChatBody(
        JSON.stringify({ chunks: ["Reading English", " in phrase chunks"] })
      ),
    });

    const result = await chunk(text, { provider });

    expect(result.chunks).toEqual([
      { text: "Reading English", startOffset: 0, endOffset: 15 },
      { text: " in phrase chunks", startOffset: 15, endOffset: 32 },
    ]);
    expect(result.meta.providerUsed).toBe("glm-4.7-flash");
    expect(result.meta.tokenUsage).toEqual({ prompt: 10, completion: 5 });
    expect(typeof result.meta.latencyMs).toBe("number");
  });

  it("能处理被 ```json 代码块包裹的响应", async () => {
    const text = "Hello world";
    mockFetchOnce({
      jsonBody: openAiChatBody('```json\n{"chunks": ["Hello", " world"]}\n```'),
    });

    const result = await chunk(text, { provider });
    expect(result.chunks.map((c) => c.text)).toEqual(["Hello", " world"]);
  });

  it("重复出现的片段按顺序定位，不会匹配到更早的位置", async () => {
    const text = "the cat and the dog";
    mockFetchOnce({
      jsonBody: openAiChatBody(JSON.stringify({ chunks: ["the cat and", " the dog"] })),
    });

    const result = await chunk(text, { provider });
    expect(result.chunks).toEqual([
      { text: "the cat and", startOffset: 0, endOffset: 11 },
      { text: " the dog", startOffset: 11, endOffset: 19 },
    ]);
  });
});

describe("chunk 错误分类", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("输入为空文本 -> INVALID_RESPONSE", async () => {
    await expect(chunk("   ", { provider })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("HTTP 401 -> AUTH_FAILED，不可重试", async () => {
    mockFetchOnce({ ok: false, status: 401, textBody: "invalid api key" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err).toBeInstanceOf(ChunkEngineError);
    expect(err.code).toBe("AUTH_FAILED");
    expect(err.retryable).toBe(false);
  });

  it("HTTP 403 -> AUTH_FAILED", async () => {
    mockFetchOnce({ ok: false, status: 403, textBody: "forbidden" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("AUTH_FAILED");
  });

  it("HTTP 429 -> RATE_LIMITED，可重试", async () => {
    mockFetchOnce({ ok: false, status: 429, textBody: "rate limit" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.retryable).toBe(true);
  });

  it("HTTP 408 -> TIMEOUT，可重试", async () => {
    mockFetchOnce({ ok: false, status: 408, textBody: "timeout" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
  });

  it("HTTP 500 -> SERVICE_UNAVAILABLE，可重试", async () => {
    mockFetchOnce({ ok: false, status: 500, textBody: "internal error" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.retryable).toBe(true);
  });

  it("HTTP 503 -> SERVICE_UNAVAILABLE", async () => {
    mockFetchOnce({ ok: false, status: 503, textBody: "unavailable" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("其他非 2xx 状态码（如 400）-> INVALID_RESPONSE，不可重试", async () => {
    mockFetchOnce({ ok: false, status: 400, textBody: "bad request" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
    expect(err.retryable).toBe(false);
  });

  it("fetch 抛出 AbortError -> TIMEOUT", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("TIMEOUT");
    expect(err.retryable).toBe(true);
  });

  it("fetch 抛出普通网络错误 -> NETWORK_ERROR，可重试", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.retryable).toBe(true);
  });

  it("响应体不是合法 JSON -> INVALID_RESPONSE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
        text: async () => "",
      } as unknown as Response)
    );
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
  });

  it("响应缺少 choices[0].message.content -> INVALID_RESPONSE", async () => {
    mockFetchOnce({ jsonBody: { choices: [] } });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
  });

  it("message.content 不是合法 JSON -> INVALID_RESPONSE", async () => {
    mockFetchOnce({ jsonBody: openAiChatBody("not json at all") });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
  });

  it("chunks 字段不是字符串数组 -> INVALID_RESPONSE", async () => {
    mockFetchOnce({ jsonBody: openAiChatBody(JSON.stringify({ chunks: [1, 2, 3] })) });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
  });

  it("LLM 改写了文本导致片段无法在原文中定位 -> INVALID_RESPONSE", async () => {
    mockFetchOnce({
      jsonBody: openAiChatBody(JSON.stringify({ chunks: ["This text was rewritten"] })),
    });
    const err = await chunk("Original text here", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
    expect(err.retryable).toBe(false);
  });

  it("chunks 为空数组 -> INVALID_RESPONSE", async () => {
    mockFetchOnce({ jsonBody: openAiChatBody(JSON.stringify({ chunks: [] })) });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("INVALID_RESPONSE");
  });
});

describe("thinking 字段仅对 GLM provider 附加", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function captureRequestBody(jsonBody: unknown) {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => jsonBody,
      text: async () => "",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("GLM 官方 baseURL -> 请求体携带 thinking:disabled", async () => {
    const fetchMock = captureRequestBody(openAiChatBody(JSON.stringify({ chunks: ["text"] })));
    await chunk("text", { provider });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.thinking).toEqual({ type: "disabled" });
  });

  it("非 GLM baseURL（如 Gemini 兼容层）-> 请求体不携带 thinking 字段", async () => {
    const fetchMock = captureRequestBody(openAiChatBody(JSON.stringify({ chunks: ["text"] })));
    const geminiProvider: ProviderConfig = {
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: "test-key",
      model: "gemini-2.5-flash",
    };
    await chunk("text", { provider: geminiProvider });

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.thinking).toBeUndefined();
  });
});
