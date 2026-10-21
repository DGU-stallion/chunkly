import { describe, it, expect } from "vitest";
import { applyHighlight, undoHighlight } from "../src/highlight.js";
import type { Chunk } from "@chunkly/engine";

/**
 * 这一组测试守着 ADR-0001：高亮不得销毁宿主页面的原始 DOM 文本节点，
 * 且必须可无损撤销。
 *
 * 早期实现用 range.deleteContents() + insertNode()，会把原始 Text 节点销毁，
 * 导致无法撤销、并破坏 React/Vue 这类受控渲染框架持有的节点引用。
 */

function setup(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

function chunksFor(text: string, splits: string[]): Chunk[] {
  // 由字面量切分点生成 chunk，避免在测试里重算实现逻辑
  const chunks: Chunk[] = [];
  let cursor = 0;
  for (const piece of splits) {
    const start = text.indexOf(piece, cursor);
    chunks.push({ text: piece, startOffset: start, endOffset: start + piece.length });
    cursor = start + piece.length;
  }
  return chunks;
}

describe("applyHighlight：保留原始文本节点（ADR-0001）", () => {
  it("高亮后原始 Text 节点仍然挂在 DOM 上（节点身份未被销毁）", () => {
    const root = setup("<p id='p'>Reading English in chunks</p>");
    const p = root.querySelector("#p") as HTMLParagraphElement;
    const originalNode = p.firstChild as Text;
    const originalText = "Reading English in chunks";

    const range = document.createRange();
    range.selectNodeContents(p);

    applyHighlight(range, originalText, chunksFor(originalText, ["Reading English", " in chunks"]));

    // 契约：节点身份存活。
    // 注：splitText 会把原节点的 data 截短，这是 splitText 语义的一部分——
    // 关键是不能像 deleteContents 那样把节点从文档里删掉，否则宿主框架持有的
    // 引用（React 的 fiber 等）会失效、且无法撤销。
    expect(originalNode.isConnected).toBe(true);
    // 契约：容器内文本总量不丢字
    expect(p.textContent).toBe(originalText);
  });

  it("高亮后容器内所有文本拼起来仍等于原文（无损）", () => {
    const root = setup("<p id='p'>The quick brown fox jumps</p>");
    const p = root.querySelector("#p") as HTMLParagraphElement;
    const text = "The quick brown fox jumps";

    const range = document.createRange();
    range.selectNodeContents(p);
    applyHighlight(range, text, chunksFor(text, ["The quick brown fox", " jumps"]));

    expect(p.textContent).toBe(text);
  });

  it("高亮确实把文本包进了带类名的 span", () => {
    const root = setup("<p id='p'>Reading English in chunks</p>");
    const p = root.querySelector("#p") as HTMLParagraphElement;
    const text = "Reading English in chunks";

    const range = document.createRange();
    range.selectNodeContents(p);
    applyHighlight(range, text, chunksFor(text, ["Reading English", " in chunks"]));

    const spans = Array.from(p.querySelectorAll(".chunkly-chunk")).map((s) => s.textContent);
    expect(spans).toEqual(["Reading English", " in chunks"]);
  });
});

describe("undoHighlight：无损撤销", () => {
  it("撤销后 textContent 与高亮前逐字符一致", () => {
    const original = "The researchers who conducted the study argued that the results should be replicated.";
    const root = setup(`<p id='p'>${original}</p>`);
    const p = root.querySelector("#p") as HTMLParagraphElement;

    const range = document.createRange();
    range.selectNodeContents(p);
    applyHighlight(range, original, chunksFor(original, ["The researchers", " who conducted the study", " argued that the results should be replicated."]));

    undoHighlight(p);

    expect(p.textContent).toBe(original);
  });

  it("撤销后页面不再包含任何 chunkly span", () => {
    const original = "Hello world again";
    const root = setup(`<p id='p'>${original}</p>`);
    const p = root.querySelector("#p") as HTMLParagraphElement;

    const range = document.createRange();
    range.selectNodeContents(p);
    applyHighlight(range, original, chunksFor(original, ["Hello", " world", " again"]));

    undoHighlight(p);

    expect(p.querySelectorAll(".chunkly-chunk")).toHaveLength(0);
  });

  it("撤销后文本节点被 normalize 合并成一个节点", () => {
    const original = "Hello world again";
    const root = setup(`<p id='p'>${original}</p>`);
    const p = root.querySelector("#p") as HTMLParagraphElement;

    const range = document.createRange();
    range.selectNodeContents(p);
    applyHighlight(range, original, chunksFor(original, ["Hello", " world", " again"]));

    undoHighlight(p);

    expect(p.childNodes).toHaveLength(1);
    expect((p.firstChild as Text).textContent).toBe(original);
  });

  it("重复高亮再撤销，结果仍是原文（不产生嵌套 span）", () => {
    const original = "Alpha beta gamma";
    const root = setup(`<p id='p'>${original}</p>`);
    const p = root.querySelector("#p") as HTMLParagraphElement;

    for (let i = 0; i < 2; i++) {
      undoHighlight(p);
      const range = document.createRange();
      range.selectNodeContents(p);
      applyHighlight(range, original, chunksFor(original, ["Alpha", " beta", " gamma"]));
    }

    expect(p.querySelectorAll(".chunkly-chunk").length).toBeLessThanOrEqual(3);
    undoHighlight(p);
    expect(p.textContent).toBe(original);
  });
});

describe("部分选区（回归：曾整体错位到段首）", () => {
  it("只选中段落中段时，高亮落在选中部分而不是段首", () => {
    const FULL = "AAA BBB CCC DDD EEE";
    document.body.innerHTML = `<p id="p">${FULL}</p>`;
    const p = document.getElementById("p") as HTMLParagraphElement;
    const textNode = p.firstChild as Text;

    const start = FULL.indexOf("CCC");
    const selected = "CCC DDD";
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + selected.length);

    applyHighlight(range, selected, [
      { text: "CCC", startOffset: 0, endOffset: 3 },
      { text: " DDD", startOffset: 3, endOffset: 7 },
    ]);

    const spans = Array.from(p.querySelectorAll(".chunkly-chunk")).map((s) => s.textContent);
    expect(spans).toEqual(["CCC", " DDD"]);
    expect(p.textContent).toBe(FULL);
  });

  it("部分选区撤销后仍是完整原文", () => {
    const FULL = "AAA BBB CCC DDD EEE";
    document.body.innerHTML = `<p id="p">${FULL}</p>`;
    const p = document.getElementById("p") as HTMLParagraphElement;
    const textNode = p.firstChild as Text;

    const start = FULL.indexOf("CCC");
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, start + 7);

    applyHighlight(range, "CCC DDD", [{ text: "CCC DDD", startOffset: 0, endOffset: 7 }]);
    undoHighlight(p);

    expect(p.textContent).toBe(FULL);
    expect(p.querySelectorAll(".chunkly-chunk")).toHaveLength(0);
  });
});

describe("跨段落选区（ticket 04）", () => {
  it("选区跨两个段落时，两段都被高亮且文本无损", () => {
    document.body.innerHTML =
      "<div id='root'><p id='a'>Reading English</p><p id='b'>in phrase chunks</p></div>";
    const root = document.getElementById("root") as HTMLDivElement;
    // DOM 里两个文本节点直接拼接后的选区文本
    const fullText = "Reading Englishin phrase chunks";

    const range = document.createRange();
    range.setStart(root.querySelector("#a")!.firstChild!, 0);
    range.setEnd(root.querySelector("#b")!.firstChild!, 16);

    applyHighlight(range, fullText, [
      { text: "Reading English", startOffset: 0, endOffset: 15 },
      { text: "in phrase chunks", startOffset: 15, endOffset: 31 },
    ]);

    const spans = Array.from(root.querySelectorAll(".chunkly-chunk")).map((s) => s.textContent);
    expect(spans).toEqual(["Reading English", "in phrase chunks"]);
    expect(root.textContent).toBe(fullText);
  });

  it("跨段落高亮不破坏块级结构（段落仍然是两个独立 <p>）", () => {
    document.body.innerHTML =
      "<div id='root'><p id='a'>Reading English</p><p id='b'>in phrase chunks</p></div>";
    const root = document.getElementById("root") as HTMLDivElement;
    const fullText = "Reading Englishin phrase chunks";

    const range = document.createRange();
    range.setStart(root.querySelector("#a")!.firstChild!, 0);
    range.setEnd(root.querySelector("#b")!.firstChild!, 16);

    applyHighlight(range, fullText, [
      { text: "Reading English", startOffset: 0, endOffset: 15 },
      { text: "in phrase chunks", startOffset: 15, endOffset: 31 },
    ]);

    expect(root.querySelectorAll("p")).toHaveLength(2);
    expect(root.querySelector("#a")!.textContent).toBe("Reading English");
    expect(root.querySelector("#b")!.textContent).toBe("in phrase chunks");
  });

  it("跨段落撤销后两段文本都还原", () => {
    document.body.innerHTML =
      "<div id='root'><p id='a'>Reading English</p><p id='b'>in phrase chunks</p></div>";
    const root = document.getElementById("root") as HTMLDivElement;
    const fullText = "Reading Englishin phrase chunks";

    const range = document.createRange();
    range.setStart(root.querySelector("#a")!.firstChild!, 0);
    range.setEnd(root.querySelector("#b")!.firstChild!, 16);

    applyHighlight(range, fullText, [
      { text: "Reading English", startOffset: 0, endOffset: 15 },
      { text: "in phrase chunks", startOffset: 15, endOffset: 31 },
    ]);
    undoHighlight(root);

    expect(root.querySelector("#a")!.textContent).toBe("Reading English");
    expect(root.querySelector("#b")!.textContent).toBe("in phrase chunks");
  });
});
