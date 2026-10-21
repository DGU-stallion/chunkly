import { describe, it, expect } from "vitest";
import { splitIntoSegments, mergeSegmentChunks } from "../src/segment.js";

/** 不变量：所有段拼起来必须逐字符等于原文 */
function assertLossless(text: string, segments: ReturnType<typeof splitIntoSegments>) {
  expect(segments.map((s) => s.text).join("")).toBe(text);
}

/** 不变量：每段的 offset 与原文切片一致 */
function assertOffsets(text: string, segments: ReturnType<typeof splitIntoSegments>) {
  for (const seg of segments) {
    expect(text.slice(seg.startOffset, seg.endOffset)).toBe(seg.text);
  }
}

/** 不变量：段边界必须落在句末之后（空白之后），不能切在句子中间 */
function assertSentenceBoundaries(text: string, segments: ReturnType<typeof splitIntoSegments>) {
  for (let i = 0; i < segments.length - 1; i++) {
    const cut = segments[i].endOffset;
    const before = text.slice(0, cut);
    // 切点之前应当是句末标点（可能带引号）之后
    expect(before).toMatch(/[.!?…]["'”’)\]]*\s+$/);
  }
}

const LONG_TEXT =
  "Reading in phrases is not a trick you can switch on. " +
  "It is a habit built by repeated exposure to text that is just slightly harder than what you can already handle comfortably. " +
  "When learners meet an unfamiliar word, they often stop, decode it letter by letter, and lose the thread of the sentence. " +
  "The result is a reading experience that feels like assembling a puzzle from loose pieces rather than following an argument. " +
  "Native readers do something different: they take in three to six words at a time, and they let the structure of the sentence carry them forward. " +
  "This is why teachers tell students to mark thought groups, and why the pauses matter more than the speed.";

describe("splitIntoSegments", () => {
  it("短文本不切分", () => {
    const segments = splitIntoSegments("Hello world.", 500);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe("Hello world.");
  });

  it("空文本返回空数组", () => {
    expect(splitIntoSegments("", 500)).toEqual([]);
  });

  it("长文本会切成多段，且拼回后逐字符无损", () => {
    const segments = splitIntoSegments(LONG_TEXT, 200);
    expect(segments.length).toBeGreaterThan(1);
    assertLossless(LONG_TEXT, segments);
    assertOffsets(LONG_TEXT, segments);
  });

  it("只在句子边界处切分，不会把句子切一半", () => {
    const segments = splitIntoSegments(LONG_TEXT, 200);
    assertSentenceBoundaries(LONG_TEXT, segments);
  });

  it("单句超长（无句号）时不硬切，宁可整段返回", () => {
    const noStop = "a very long clause without any sentence ending punctuation that just keeps going and going";
    const segments = splitIntoSegments(noStop, 20);
    expect(segments).toHaveLength(1);
    expect(segments[0].text).toBe(noStop);
  });

  it("句子边界后的引号/括号不会被切断在段首", () => {
    const text =
      'He said "I am done." Then he left the room quietly. ' +
      "After that, nobody spoke for a long moment. " +
      'Finally she asked "why did you do it?" and waited for an answer.';
    const segments = splitIntoSegments(text, 40);
    expect(segments.length).toBeGreaterThan(1);
    assertLossless(text, segments);
    assertSentenceBoundaries(text, segments);
  });

  it("段长贴近目标但不超过太多（单句长度是下界）", () => {
    const segments = splitIntoSegments(LONG_TEXT, 200);
    // 每段应 >= 目标长度，除非它是最后一段
    for (let i = 0; i < segments.length - 1; i++) {
      expect(segments[i].text.length).toBeGreaterThanOrEqual(200);
    }
  });
});

describe("mergeSegmentChunks", () => {
  it("把段内 offset 平移回原文坐标", () => {
    const text = "Alpha one. Beta two.";
    const segments = splitIntoSegments(text, 11);
    expect(segments).toHaveLength(2);
    // 段边界包含句末空白，空格归属于前一段末尾（与 prompt 契约一致）
    expect(segments[0]).toEqual({ startOffset: 0, endOffset: 11, text: "Alpha one. " });
    expect(segments[1]).toEqual({ startOffset: 11, endOffset: 20, text: "Beta two." });

    const merged = mergeSegmentChunks(
      [
        { segment: segments[0], chunks: [{ text: "Alpha one.", startOffset: 0, endOffset: 10 }] },
        { segment: segments[1], chunks: [{ text: "Beta two.", startOffset: 0, endOffset: 9 }] },
      ],
      text
    );

    // 段末的空白会被并入前一个 chunk（避免出现只含空格的色块），
    // 同时保证拼回仍然等于原文。
    expect(merged).toEqual([
      { text: "Alpha one. ", startOffset: 0, endOffset: 11 },
      { text: "Beta two.", startOffset: 11, endOffset: 20 },
    ]);
    expect(merged.map((c) => c.text).join("")).toBe(text);
    // 不应有任何纯空白 chunk 泄露到高亮层
    expect(merged.every((c) => c.text.trim().length > 0)).toBe(true);
  });

  it("合并结果拼起来等于原文（不丢字）", () => {
    const merged = mergeSegmentChunks(
      [
        { segment: { startOffset: 0, endOffset: 10, text: "Alpha one." }, chunks: [{ text: "Alpha one.", startOffset: 0, endOffset: 10 }] },
        { segment: { startOffset: 10, endOffset: 20, text: " Beta two." }, chunks: [{ text: "Beta two.", startOffset: 1, endOffset: 10 }] },
      ],
      "Alpha one. Beta two."
    );
    expect(merged.map((c) => c.text).join("")).toBe("Alpha one. Beta two.");
  });

  it("段内空隙被补成 chunk，保证覆盖全文", () => {
    const text = "Alpha one two.";
    const merged = mergeSegmentChunks(
      [
        {
          segment: { startOffset: 0, endOffset: 14, text },
          chunks: [
            { text: "Alpha", startOffset: 0, endOffset: 5 },
            { text: "two.", startOffset: 10, endOffset: 14 },
          ],
        },
      ],
      text
    );
    expect(merged.map((c) => c.text).join("")).toBe(text);
    expect(merged.find((c) => c.text === " one ")?.startOffset).toBe(5);
  });
});

describe("absorbWhitespaceChunks（通过 mergeSegmentChunks 观察）", () => {
  it("纯空白 chunk 被并入前一个 chunk，不产生空白色块", () => {
    const text = "One. Two. Three.";
    const merged = mergeSegmentChunks(
      [
        { segment: { startOffset: 0, endOffset: 5, text: "One. " }, chunks: [{ text: "One.", startOffset: 0, endOffset: 4 }] },
        { segment: { startOffset: 5, endOffset: 10, text: "Two. " }, chunks: [{ text: "Two.", startOffset: 0, endOffset: 4 }] },
        { segment: { startOffset: 10, endOffset: 16, text: "Three." }, chunks: [{ text: "Three.", startOffset: 0, endOffset: 6 }] },
      ],
      text
    );
    expect(merged.map((c) => c.text).join("")).toBe(text);
    expect(merged.every((c) => c.text.trim().length > 0)).toBe(true);
    expect(merged).toEqual([
      { text: "One. ", startOffset: 0, endOffset: 5 },
      { text: "Two. ", startOffset: 5, endOffset: 10 },
      { text: "Three.", startOffset: 10, endOffset: 16 },
    ]);
  });

  it("开头就是空白时，并入后续首个 chunk 的头部", () => {
    const text = "  Hello world.";
    const merged = mergeSegmentChunks(
      [{ segment: { startOffset: 0, endOffset: 14, text }, chunks: [{ text: "Hello world.", startOffset: 2, endOffset: 14 }] }],
      text
    );
    expect(merged.map((c) => c.text).join("")).toBe(text);
    expect(merged[0]).toEqual({ text: "  Hello world.", startOffset: 0, endOffset: 14 });
  });
});
