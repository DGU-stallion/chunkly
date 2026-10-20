import { describe, it, expect } from "vitest";
import { computeSegments } from "../src/highlight.js";
import type { Chunk } from "@chunkly/engine";

describe("computeSegments", () => {
  it("完全覆盖时不产生空隙 segment", () => {
    const text = "Reading English in phrase chunks";
    const chunks: Chunk[] = [
      { text: "Reading English", startOffset: 0, endOffset: 15 },
      { text: " in phrase chunks", startOffset: 15, endOffset: 33 },
    ];
    const segments = computeSegments(text, chunks);
    expect(segments).toEqual([
      { text: "Reading English", chunkIndex: 0 },
      { text: " in phrase chunks", chunkIndex: 1 },
    ]);
  });

  it("chunk 之间/前后有空隙时，空隙作为 chunkIndex: null 的 segment 保留", () => {
    const text = "AAA gap BBB";
    const chunks: Chunk[] = [
      { text: "AAA", startOffset: 0, endOffset: 3 },
      { text: "BBB", startOffset: 8, endOffset: 11 },
    ];
    const segments = computeSegments(text, chunks);
    expect(segments).toEqual([
      { text: "AAA", chunkIndex: 0 },
      { text: " gap ", chunkIndex: null },
      { text: "BBB", chunkIndex: 1 },
    ]);
  });

  it("空 chunks 数组时整段文本作为一个未高亮 segment", () => {
    const segments = computeSegments("hello", []);
    expect(segments).toEqual([{ text: "hello", chunkIndex: null }]);
  });

  it("chunk 未覆盖到文本末尾时，末尾空隙也要保留", () => {
    const text = "AAA tail";
    const chunks: Chunk[] = [{ text: "AAA", startOffset: 0, endOffset: 3 }];
    const segments = computeSegments(text, chunks);
    expect(segments).toEqual([
      { text: "AAA", chunkIndex: 0 },
      { text: " tail", chunkIndex: null },
    ]);
  });
});
