import { describe, it, expect } from "vitest";
import { parseChunkResponse } from "../src/parse.js";

/**
 * 切点吸附（snap）。
 *
 * 背景：并非所有模型都严格遵守「只插切点、不改字符」。
 * 实测 Gemini Nano 会把切分处的空格吞掉：
 *   ["She put","the keys"] 拼出 "She putthe keys"（丢了空格）
 * 云端 deepseek 也在一次 297 字请求里丢了字符。
 *
 * 这类输出如果直接报 INVALID_RESPONSE，等于把一次本来可用的切分整体丢掉。
 * 吸附算法把模型输出退化为「切点提示」，在原文里对齐到最近的合法词边界，
 * 保证**输出的 chunks 永远无损**——这是 engine 的硬契约。
 */

describe("parseChunkResponse：无损输出是硬契约", () => {
  it("模型吞掉空格时，吸附后仍能无损且切点落在词边界", () => {
    const text = "She put the keys on the table by the door.";
    // Nano 的真实输出：chunks 之间丢了空格
    const raw = JSON.stringify({ chunks: ["She put", "the keys", "on the", "table by", "the door."] });

    const chunks = parseChunkResponse(raw, text);

    expect(chunks.map((c) => c.text).join("")).toBe(text);
    for (const c of chunks) {
      expect(text.slice(c.startOffset, c.endOffset)).toBe(c.text);
    }
  });

  it("吸附不会切在单词中间", () => {
    const text = "The researchers who conducted the study argued that the results matter.";
    const raw = JSON.stringify({
      chunks: ["The resear", "chers who cond", "ucted the study", "argued that the results matter."],
    });

    const chunks = parseChunkResponse(raw, text);
    expect(chunks.map((c) => c.text).join("")).toBe(text);

    // 切点在单词中间 ⇔ 切点左右两侧都是非空白字符。
    // 不能写成「切点右侧必须是空白」——前一个 chunk 吞了尾随空格时，
    // 下一个 chunk 会从字母开始，这也是合法的。
    for (const c of chunks) {
      const left = text[c.startOffset - 1];
      const right = text[c.startOffset];
      if (left !== undefined && right !== undefined) {
        expect(/\s/.test(left) || /\s/.test(right)).toBe(true);
      }
    }
  });

  it("模型正常输出时保持原样（不因吸附而改变正确结果）", () => {
    const text = "She put the keys on the table by the door.";
    const raw = JSON.stringify({ chunks: ["She put the keys ", "on the table ", "by the door."] });

    const chunks = parseChunkResponse(raw, text);

    expect(chunks.map((c) => c.text).join("")).toBe(text);
    expect(chunks.length).toBe(3);
  });

  it("模型完全编造内容（原文里找不到）时仍报 INVALID_RESPONSE", () => {
    const text = "She put the keys on the table by the door.";
    const raw = JSON.stringify({ chunks: ["完全无关的中文内容", "another hallucination"] });

    expect(() => parseChunkResponse(raw, text)).toThrowError(/无法在原文中定位|INVALID_RESPONSE/);
  });

  it("带 markdown 代码块包裹的 JSON 也能处理", () => {
    const text = "She put the keys on the table by the door.";
    const raw = "```json\n" + JSON.stringify({ chunks: ["She put the keys ", "on the table by the door."] }) + "\n```";

    const chunks = parseChunkResponse(raw, text);
    expect(chunks.map((c) => c.text).join("")).toBe(text);
  });
});
