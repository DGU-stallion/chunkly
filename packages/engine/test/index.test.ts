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

  it("400 -> BAD_REQUEST，不可重试（不是解析失败）", async () => {
    // 400 实测最常见的成因是「模型不支持某个参数」（如 glm 收到 reasoning_effort=off），
    // 报成 INVALID_RESPONSE 会把用户引去查解析器，方向完全错。
    mockFetchOnce({ ok: false, status: 400, textBody: "bad request" });
    const err = await chunk("text", { provider }).catch((e) => e);
    expect(err.code).toBe("BAD_REQUEST");
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

  it("当服务端因 reasoning_effort 返回 400 时，能自动剔除该参数重试并成功", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"error":{"message":"Model does not support reasoning_effort off"}}',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => openAiChatBody(JSON.stringify({ chunks: ["hello"] })),
        text: async () => "",
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const result = await chunk("hello", {
      provider,
      reasoningEffort: "off",
    });

    expect(result.chunks[0].text).toBe("hello");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 第一次带了 reasoning_effort
    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body1.reasoning_effort).toBe("off");
    // 第二次自愈重试剔除了 reasoning_effort
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(body2.reasoning_effort).toBeUndefined();
  });
});

describe("分段并发", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** 造一段足够长的文本，含多句 */
  function longText(sentenceCount: number): string {
    return Array.from(
      { length: sentenceCount },
      (_, i) => `Sentence number ${i + 1} is here to make the text long enough for splitting.`
    ).join(" ");
  }

  it("长文本会并发拆成多段，且结果拼起来等于原文", async () => {
    const text = longText(12);
    expect(text.length).toBeGreaterThan(600);

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const userContent: string = body.messages[1].content;
        const segmentText = userContent.replace(/^Split the following text:\n\n/, "");
        calls.push(segmentText);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ chunks: [segmentText] }) } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
          }),
          text: async () => "",
        } as Response;
      })
    );

    const result = await chunk(text, { provider });

    expect(calls.length).toBeGreaterThan(1);
    expect(result.meta.segmentCount).toBe(calls.length);
    // 关键不变量：offset 精确 + 拼回等于原文
    expect(result.chunks.map((c) => c.text).join("")).toBe(text);
    for (const c of result.chunks) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
    }
    // usage 是各段合计
    expect(result.meta.tokenUsage.prompt).toBe(100 * calls.length);
    expect(result.meta.tokenUsage.completion).toBe(20 * calls.length);
  });

  it("短文本不并发，只发一次请求", async () => {
    const text = "Reading in phrases is a good habit.";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => openAiChatBody(JSON.stringify({ chunks: [text] })),
      text: async () => "",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await chunk(text, { provider });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.meta.segmentCount).toBe(1);
  });

  it("disableConcurrency 时即使长文本也只发一次请求", async () => {
    const text = longText(12);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => openAiChatBody(JSON.stringify({ chunks: [text] })),
      text: async () => "",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await chunk(text, { provider, disableConcurrency: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.meta.segmentCount).toBe(1);
  });

  it("某一段可重试失败后会重试并最终成功", async () => {
    const text = longText(12);
    let attempts = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        attempts++;
        // 第一次调用返回 429，触发重试
        if (attempts === 1) {
          return {
            ok: false,
            status: 429,
            json: async () => ({}),
            text: async () => "rate limited",
          } as Response;
        }
        const body = JSON.parse(init.body as string);
        const segmentText: string = body.messages[1].content.replace(
          /^Split the following text:\n\n/,
          ""
        );
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ chunks: [segmentText] }) } }],
            usage: { prompt_tokens: 10, completion_tokens: 2 },
          }),
          text: async () => "",
        } as Response;
      })
    );

    const result = await chunk(text, { provider });
    expect(attempts).toBeGreaterThan(1);
    expect(result.chunks.map((c) => c.text).join("")).toBe(text);
  });

  it("段内不可重试错误（如 BAD_REQUEST）直接抛出，不做无意义重试", async () => {
    const text = longText(12);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({}),
        text: async () => "bad request",
      } as Response)
    );

    await expect(chunk(text, { provider })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      retryable: false,
    });
  });
});

describe("并发对长文本的可靠性收益", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * 回归测试：单次请求处理超长文本会因输出被 max_tokens 截断而失败
   * （实测 12911 字符串行请求返回的 JSON 不合法）。
   * 分段并发把输出也切开了，因此能成功。这里用 mock 模拟同样的截断行为。
   */
  it("超长文本单请求被截断时失败，分段并发则成功", async () => {
    const text = Array.from(
      { length: 90 },
      (_, i) => `Sentence number ${i + 1} keeps the passage going for a while longer.`
    ).join(" ");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        const segText: string = body.messages[1].content.replace(
          /^Split the following text:\n\n/,
          ""
        );
        // 模拟真实行为：输入过长时输出 JSON 被截断
        if (segText.length > 4000) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: '{"chunks": ["Sentence number 1 keeps' } }],
              usage: { prompt_tokens: 1, completion_tokens: 1 },
            }),
            text: async () => "",
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ chunks: [segText] }) } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
          text: async () => "",
        } as Response;
      })
    );

    // 串行：整段一次性发，触发截断 -> INVALID_RESPONSE
    await expect(chunk(text, { provider, disableConcurrency: true })).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });

    // 并发：拆成多段，每段都短于截断阈值 -> 成功且无损
    const result = await chunk(text, { provider });
    expect(result.meta.segmentCount).toBeGreaterThan(1);
    expect(result.chunks.map((c) => c.text).join("")).toBe(text);
  });
});
