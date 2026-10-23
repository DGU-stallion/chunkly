import { describe, it, expect } from "vitest";
import {
  applyHighlight,
  undoHighlight,
  setActiveHighlightChunk,
} from "../src/highlight.js";
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

  it("选区包含多段换行（\\n\\n）时，换行符绝不包进 chunk span，只在英文文字上渲染", () => {
    document.body.innerHTML =
      "<div id='root'><p id='a'>Paragraph one text.</p><p id='b'>Paragraph two text.</p></div>";
    const root = document.getElementById("root") as HTMLDivElement;
    // 浏览器跨段划选时产生的真实 fullText（包含段间 \\n\\n）
    const fullText = "Paragraph one text.\n\nParagraph two text.";

    const range = document.createRange();
    range.setStart(root.querySelector("#a")!.firstChild!, 0);
    range.setEnd(root.querySelector("#b")!.firstChild!, 19);

    applyHighlight(range, fullText, [
      { text: "Paragraph one text.", startOffset: 0, endOffset: 19 },
      { text: "\n\nParagraph two text.", startOffset: 19, endOffset: 40 },
    ]);

    const spans = Array.from(root.querySelectorAll(".chunkly-chunk"));
    expect(spans.length).toBeGreaterThan(0);
    // 契约：任何 chunk span 的文字内容均严禁包含 \n 或 \r
    for (const span of spans) {
      expect(span.textContent).not.toMatch(/[\r\n]/);
    }
    // 第一段和第二段均被正确包裹，且文字内容精确对应
    expect(root.querySelector("#a")!.querySelector(".chunkly-chunk")!.textContent).toBe("Paragraph one text.");
    expect(root.querySelector("#b")!.querySelector(".chunkly-chunk")!.textContent).toBe("Paragraph two text.");

    // 撤销后无损还原
    undoHighlight(root);
    expect(root.querySelector("#a")!.textContent).toBe("Paragraph one text.");
    expect(root.querySelector("#b")!.textContent).toBe("Paragraph two text.");
  });

  it("单文本节点内部包含换行符（如 pre 或多行文本）时，换行符保持裸露，不被 span 包裹", () => {
    document.body.innerHTML = "<div id='article'>First line of story.\n\nSecond line of story.</div>";
    const div = document.getElementById("article") as HTMLDivElement;
    const fullText = "First line of story.\n\nSecond line of story.";

    const range = document.createRange();
    range.selectNodeContents(div);

    applyHighlight(range, fullText, [
      { text: "First line of story.", startOffset: 0, endOffset: 20 },
      { text: "\n\nSecond line of story.", startOffset: 20, endOffset: 43 },
    ]);

    const spans = Array.from(div.querySelectorAll(".chunkly-chunk"));
    expect(spans).toHaveLength(2);
    expect(spans[0].textContent).toBe("First line of story.");
    expect(spans[1].textContent).toBe("Second line of story.");
    // 容器整体文本依然严格逐字一致
    expect(div.textContent).toBe(fullText);

    undoHighlight(div);
    expect(div.textContent).toBe(fullText);
    expect(div.querySelectorAll(".chunkly-chunk")).toHaveLength(0);
  });
});

describe("setActiveHighlightChunk 卡拉OK视听同步高亮", () => {
  it("指定 chunkIndex 时，将该意群的所有 span 赋予 active 类，其他取消", () => {
    document.body.innerHTML = "<p id='p'>Alpha Beta Gamma</p>";
    const p = document.getElementById("p") as HTMLParagraphElement;
    const text = "Alpha Beta Gamma";
    const range = document.createRange();
    range.selectNodeContents(p);

    applyHighlight(range, text, [
      { text: "Alpha", startOffset: 0, endOffset: 5 },
      { text: " Beta", startOffset: 5, endOffset: 10 },
      { text: " Gamma", startOffset: 10, endOffset: 16 },
    ]);

    setActiveHighlightChunk(p, 1);
    const spans = p.querySelectorAll(".chunkly-chunk");
    expect(spans[0].classList.contains("chunkly-chunk-active")).toBe(false);
    expect(spans[1].classList.contains("chunkly-chunk-active")).toBe(true);
    expect(spans[2].classList.contains("chunkly-chunk-active")).toBe(false);

    setActiveHighlightChunk(p, null);
    expect(p.querySelectorAll(".chunkly-chunk-active").length).toBe(0);
  });

  it("当页面存在多个独立切分段落时，传入 scopeId 仅激活指定段落的意群，其他段落绝不联动跳动", () => {
    document.body.innerHTML = `
      <div id='doc'>
        <p id='paraA'>Paragraph A chunk 0. Paragraph A chunk 1.</p>
        <p id='paraB'>Paragraph B chunk 0. Paragraph B chunk 1.</p>
      </div>
    `;
    const doc = document.getElementById("doc") as HTMLDivElement;
    const pA = document.getElementById("paraA") as HTMLParagraphElement;
    const pB = document.getElementById("paraB") as HTMLParagraphElement;

    const rangeA = document.createRange();
    rangeA.selectNodeContents(pA);
    const scopeA = applyHighlight(rangeA, pA.textContent!, [
      { text: "Paragraph A chunk 0. ", startOffset: 0, endOffset: 21 },
      { text: "Paragraph A chunk 1.", startOffset: 21, endOffset: 41 },
    ], "scope-A");

    const rangeB = document.createRange();
    rangeB.selectNodeContents(pB);
    const scopeB = applyHighlight(rangeB, pB.textContent!, [
      { text: "Paragraph B chunk 0. ", startOffset: 0, endOffset: 21 },
      { text: "Paragraph B chunk 1.", startOffset: 21, endOffset: 41 },
    ], "scope-B");

    expect(scopeA).toBe("scope-A");
    expect(scopeB).toBe("scope-B");

    // 朗读 Paragraph B 的 chunk 0：只激活 paraB 中的 chunk 0，paraA 的下划线绝不跳动！
    setActiveHighlightChunk(doc, 0, "scope-B");

    const spansA = pA.querySelectorAll(".chunkly-chunk");
    const spansB = pB.querySelectorAll(".chunkly-chunk");

    expect(spansA[0].classList.contains("chunkly-chunk-active")).toBe(false);
    expect(spansA[1].classList.contains("chunkly-chunk-active")).toBe(false);

    expect(spansB[0].classList.contains("chunkly-chunk-active")).toBe(true);
    expect(spansB[1].classList.contains("chunkly-chunk-active")).toBe(false);

    // 朗读推进到 Paragraph B 的 chunk 1
    setActiveHighlightChunk(doc, 1, "scope-B");
    expect(spansA[0].classList.contains("chunkly-chunk-active")).toBe(false);
    expect(spansA[1].classList.contains("chunkly-chunk-active")).toBe(false);
    expect(spansB[0].classList.contains("chunkly-chunk-active")).toBe(false);
    expect(spansB[1].classList.contains("chunkly-chunk-active")).toBe(true);
  });

  it("高亮元素包含正确的调色盘轮换类名且不覆盖宿主文字语义", () => {
    document.body.innerHTML = "<p id='p'>First chunk second chunk third chunk fourth chunk fifth chunk</p>";
    const p = document.getElementById("p") as HTMLParagraphElement;
    const text = p.textContent!;

    const splits = ["First chunk", " second chunk", " third chunk", " fourth chunk", " fifth chunk"];
    const range = document.createRange();
    range.selectNodeContents(p);

    applyHighlight(range, text, chunksFor(text, splits));

    const spans = p.querySelectorAll<HTMLSpanElement>(".chunkly-chunk");
    expect(spans.length).toBe(5);

    // 调色盘从 0 到 3 循环
    expect(spans[0].classList.contains("chunkly-chunk-0")).toBe(true);
    expect(spans[1].classList.contains("chunkly-chunk-1")).toBe(true);
    expect(spans[2].classList.contains("chunkly-chunk-2")).toBe(true);
    expect(spans[3].classList.contains("chunkly-chunk-3")).toBe(true);
    expect(spans[4].classList.contains("chunkly-chunk-0")).toBe(true);
  });
});
