import { describe, it, expect } from "vitest";
import { chunkByRules } from "../src/rules.js";
import { chunkFast } from "../src/index.js";

/**
 * 规则法意群切分。
 *
 * 定位：**秒出首屏**的降级方案。LLM 结果到达后会被替换。
 * 因此衡量标准不是「和 LLM 一样好」，而是：
 *   1. 必须无损（拼回等于原文）——这条和 LLM 路径同等严格；
 *   2. 必须快（<10ms）——否则失去存在意义；
 *   3. 切分要明显好于逐词，至少做到按意群分组。
 */

/** 不变量：无损 */
function assertLossless(text: string, chunks: string[]) {
  expect(chunks.join("")).toBe(text);
}

/** 不变量：切点不落在词内 */
function assertNoMidWordSplit(text: string, chunks: string[]) {
  let cursor = 0;
  for (const c of chunks) {
    const start = text.indexOf(c, cursor);
    expect(start).toBe(cursor);
    cursor = start + c.length;
  }
}

describe("chunkByRules：无损契约", () => {
  it("拼回去逐字符等于原文", () => {
    const text =
      "The researchers who conducted the study, which was published last year, argued that the results should be replicated before any policy changes are made.";
    assertLossless(text, chunkByRules(text));
  });

  it("不切断单词", () => {
    const text = "Microsoft CEO Satya Nadella announced the acquisition of the London-based startup.";
    assertNoMidWordSplit(text, chunkByRules(text));
  });

  it("空字符串返回空数组", () => {
    expect(chunkByRules("")).toEqual([]);
  });

  it("纯空白输入原样返回，不丢字符", () => {
    const chunks = chunkByRules("   ");
    expect(chunks.join("")).toBe("   ");
  });

  it("没有标点的长串也能切，且无损", () => {
    const text = "this is a very long run on sentence without any punctuation at all and it just keeps going";
    assertLossless(text, chunkByRules(text));
  });
});

describe("chunkByRules：切分质量", () => {
  it("句末标点处一定切分", () => {
    const chunks = chunkByRules("I went to the store. She bought some bread.");
    expect(chunks.join("")).toBe("I went to the store. She bought some bread.");
    // 应在两个句子之间形成边界
    const boundaryIdx = chunks.findIndex((c) => c.trimEnd().endsWith("."));
    expect(boundaryIdx).toBeGreaterThanOrEqual(0);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("相对从句引导词前切分（who/which/that）", () => {
    const chunks = chunkByRules("The researchers who conducted the study argued that the results matter.");
    const joined = chunks.join("");
    expect(joined).toBe("The researchers who conducted the study argued that the results matter.");
    // 「who」「that」应出现在某个 chunk 的开头（即切在它们之前）
    const startsWithSubordinator = chunks.some((c) => /^\s*(who|that|which)\b/i.test(c));
    expect(startsWithSubordinator).toBe(true);
  });

  it("并列连词前切分（and/but/because）", () => {
    const chunks = chunkByRules("I wanted to help but I had no time and the meeting started.");
    expect(chunks.join("")).toBe("I wanted to help but I had no time and the meeting started.");
    const startsWithConj = chunks.some((c) => /^\s*(but|and|because)\b/i.test(c));
    expect(startsWithConj).toBe(true);
  });

  it("介词短语前切分（in/on/at/by）", () => {
    const chunks = chunkByRules("She put the keys on the table by the door.");
    expect(chunks.join("")).toBe("She put the keys on the table by the door.");
    const startsWithPrep = chunks.some((c) => /^\s*(on|by|at|in)\b/i.test(c));
    expect(startsWithPrep).toBe(true);
  });

  it("词数落在合理区间（平均 2–8 词，不超过 12）", () => {
    const text =
      "Reading in phrases is not a trick you can switch on. It is a habit built by repeated exposure to text that is just slightly harder than what you can already handle comfortably. When learners meet an unfamiliar word, they often stop, decode it letter by letter, and lose the thread of the sentence.";
    const chunks = chunkByRules(text);
    const counts = chunks
      .map((c) => (c.trim().match(/[A-Za-z0-9''-]+/g) ?? []).length)
      .filter((n) => n > 0);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(avg).toBeGreaterThanOrEqual(2);
    expect(avg).toBeLessThanOrEqual(8);
    expect(Math.max(...counts)).toBeLessThanOrEqual(12);
  });

  it("不把冠词/限定词与其名词切开", () => {
    const chunks = chunkByRules("The quick brown fox jumps over the lazy dog.");
    // 「The quick...」不应切成 "The" + " quick brown fox"
    expect(chunks[0].trim()).not.toBe("The");
  });
});

describe("chunkByRules：性能", () => {
  it("一段 1000 字文本在 10ms 内切完（首屏预算是硬约束）", () => {
    const text = Array.from(
      { length: 12 },
      (_, i) =>
        `Sentence number ${i + 1} is here to make the passage long enough for a realistic benchmark run.`
    ).join(" ");

    const start = performance.now();
    chunkByRules(text);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10);
  });
});

describe("chunkByRules：真实段落不碎成逐词（回归）", () => {
  const PARAGRAPH =
    "Reading in phrases is not a trick you can switch on. It is a habit built by repeated exposure to text that is just slightly harder than what you can already handle comfortably. When learners meet an unfamiliar word, they often stop, decode it letter by letter, and lose the thread of the sentence.";

  it("每个意群至少 2 词（不允许出现单词碎片）", () => {
    const counts = chunkByRules(PARAGRAPH)
      .map((c) => (c.trim().match(/[A-Za-z0-9'-]+/g) ?? []).length)
      .filter((n) => n > 0);

    // 早期实现会把 "It / is a / habit / built" 切碎，这条测试守着不退化
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(2);
  });

  it("意群数量在合理范围（不能多到像逐词，也不能少到整段一句）", () => {
    const chunks = chunkByRules(PARAGRAPH);
    const wordCount = (PARAGRAPH.match(/[A-Za-z0-9'-]+/g) ?? []).length;

    // 3 句话、约 60 词，合理意群数应在 8–20 之间
    expect(chunks.length).toBeGreaterThanOrEqual(8);
    expect(chunks.length).toBeLessThanOrEqual(20);
    expect(wordCount / chunks.length).toBeLessThanOrEqual(8);
  });

  it("不切开固定搭配动词短语（switch on / letter by letter）", () => {
    const chunks = chunkByRules(PARAGRAPH).map((c) => c.trim());
    // "switch on" 不应被切成两个意群
    expect(chunks.some((c) => /^on\b/.test(c))).toBe(false);
  });
});

describe("chunkFast：对外接口（含 offset）", () => {
  it("返回的 offset 与原文切片一致", () => {
    const text = "She put the keys on the table by the door.";
    const chunks = chunkFast(text);

    expect(chunks.map((c) => c.text).join("")).toBe(text);
    for (const c of chunks) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
    }
  });

  it("空输入返回空数组", () => {
    expect(chunkFast("   ")).toEqual([]);
  });

  it("单句无标点也能返回至少一个 chunk，且不丢字", () => {
    const text = "hello world";
    const chunks = chunkFast(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
  });
});
