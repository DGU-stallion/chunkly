/**
 * 意群切分的 prompt 构造。
 *
 * 设计约束：不要求 LLM 输出数字 offset（LLM 数字符位置不可靠），
 * 而是要求它输出「按意群分割后的原文子串数组」——LLM 只需要在原文中
 * 插入分割点，不需要改写或复述文本。engine 侧再用逐段顺序查找的方式
 * 把这些子串定位回原文的 startOffset/endOffset。
 */

export interface PromptGranularity {
  granularity?: "fine" | "coarse";
}

const GRANULARITY_HINT: Record<"fine" | "coarse", string> = {
  fine: "Prefer finer-grained chunking: also split at natural secondary pause points within a phrase.",
  coarse: "Prefer coarser-grained chunking: only split at major phrase boundaries, avoid over-fragmenting.",
};

export function buildSystemPrompt(): string {
  return [
    "You are an assistant that splits English text into phrase chunks for language learners.",
    "",
    "Goal: split the text the way a native speaker would naturally group words when speaking it aloud — " +
      "at the same boundaries where a fluent speaker would pause, breathe, or shift intonation (prosodic units), " +
      "not by grammar rules alone and not word-by-word.",
    "The purpose is to let the reader's eye movement match a listener's ear: each chunk should be a unit the " +
      "reader can grasp and remember as one piece of meaning, so reading trains the same chunk-level processing " +
      "used in listening comprehension, instead of decoding one word at a time.",
    "",
    "Strict rules:",
    "1. Only insert split points into the original text. Never add, remove, rewrite, or replace any character " +
      "(including whitespace, punctuation, or letter case).",
    "2. Concatenating all chunks in order must reproduce the original text exactly, character for character " +
      "(whitespace between chunks must be included inside one of the chunks, never dropped).",
    '3. Output only JSON in the form {"chunks": ["chunk1", "chunk2", ...]}. No explanation or extra text.',
  ].join("\n");
}

export function buildUserPrompt(text: string, options: PromptGranularity = {}): string {
  const hint = options.granularity ? GRANULARITY_HINT[options.granularity] : "";
  const lines = ["Split the following text:", "", text];
  if (hint) {
    lines.splice(1, 0, hint);
  }
  return lines.join("\n");
}
