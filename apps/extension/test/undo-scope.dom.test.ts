import { describe, it, expect } from "vitest";
import { applyHighlight, undoHighlightInRange, undoHighlight } from "../src/highlight.js";
import type { Chunk } from "@chunkly/engine";

/**
 * 高亮的作用域：切分第二段时不得清掉第一段。
 *
 * 用户的真实反馈：「选中一段文字 chunk 之后，再选中另一段文字，原来的高亮就消失了。」
 * 原因是切分前无条件调用 undoHighlight(document.body)，把整页清空。
 *
 * 意群辅助的用法就是**逐段读、回头对**，清空整页等于强迫用户只能看一段。
 */

function setup(html: string): void {
  document.body.innerHTML = html;
}

function chunksFor(text: string, splits: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (const piece of splits) {
    const start = text.indexOf(piece, cursor);
    chunks.push({ text: piece, startOffset: start, endOffset: start + piece.length });
    cursor = start + piece.length;
  }
  return chunks;
}

function rangeOf(el: Element): Range {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range;
}

const PARA_A = "She put the keys on the table.";
const PARA_B = "The researchers argued that the results matter.";

describe("undoHighlightInRange：只清本次选区，保留其他高亮", () => {
  it("切分第二段后，第一段的高亮仍在", () => {
    setup(`<p id="a">${PARA_A}</p><p id="b">${PARA_B}</p>`);
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;

    // 第一段：切分并高亮
    applyHighlight(rangeOf(a), PARA_A, chunksFor(PARA_A, ["She put the keys ", "on the table."]));
    expect(a.querySelectorAll(".chunkly-chunk").length).toBeGreaterThan(0);

    // 第二段：先清自己的范围，再高亮
    undoHighlightInRange(rangeOf(b));
    applyHighlight(rangeOf(b), PARA_B, chunksFor(PARA_B, ["The researchers ", "argued that the results matter."]));

    // 关键断言：第一段的高亮不能被波及
    expect(a.querySelectorAll(".chunkly-chunk").length).toBe(2);
    expect(b.querySelectorAll(".chunkly-chunk").length).toBe(2);
    expect(a.textContent).toBe(PARA_A);
    expect(b.textContent).toBe(PARA_B);
  });

  it("同一段重复切分时，旧高亮被替换而不是叠加", () => {
    setup(`<p id="a">${PARA_A}</p>`);
    const a = document.getElementById("a")!;

    applyHighlight(rangeOf(a), PARA_A, chunksFor(PARA_A, ["She put ", "the keys on the table."]));
    expect(a.querySelectorAll(".chunkly-chunk").length).toBe(2);

    // 再切一次：应先清掉本段旧高亮
    undoHighlightInRange(rangeOf(a));
    expect(a.querySelectorAll(".chunkly-chunk").length).toBe(0);
    expect(a.textContent).toBe(PARA_A);

    applyHighlight(rangeOf(a), PARA_A, chunksFor(PARA_A, ["She put the keys ", "on the table."]));
    expect(a.querySelectorAll(".chunkly-chunk").length).toBe(2);
    expect(a.textContent).toBe(PARA_A);
  });

  it("清除后文本无损失（ADR-0001 仍然成立）", () => {
    setup(`<p id="a">${PARA_A}</p>`);
    const a = document.getElementById("a")!;
    applyHighlight(rangeOf(a), PARA_A, chunksFor(PARA_A, ["She put ", "the keys ", "on the table."]));

    undoHighlightInRange(rangeOf(a));

    expect(a.textContent).toBe(PARA_A);
    // 文本节点应被 normalize 合并回一个
    expect(a.childNodes.length).toBe(1);
  });

  it("页面上没有高亮时调用不报错", () => {
    setup(`<p id="a">${PARA_A}</p>`);
    const a = document.getElementById("a")!;
    expect(() => undoHighlightInRange(rangeOf(a))).not.toThrow();
    expect(a.textContent).toBe(PARA_A);
  });
});

describe("undoHighlight：整页清除（保留给快捷键与右键菜单）", () => {
  it("清掉所有段落的高亮，文本无损", () => {
    setup(`<p id="a">${PARA_A}</p><p id="b">${PARA_B}</p>`);
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    applyHighlight(rangeOf(a), PARA_A, chunksFor(PARA_A, ["She put ", "the keys on the table."]));
    applyHighlight(rangeOf(b), PARA_B, chunksFor(PARA_B, ["The researchers ", "argued that the results matter."]));

    undoHighlight(document.body);

    expect(document.querySelectorAll(".chunkly-chunk").length).toBe(0);
    expect(a.textContent).toBe(PARA_A);
    expect(b.textContent).toBe(PARA_B);
  });
});
