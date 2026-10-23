/**
 * 意群切分的 prompt 构造。
 *
 * 理论根基与设计原则（基于 SLA 二语习得与认知心理学）：
 * 1. Judy B. Gilbert（剑桥大学出版社《Clear Speech》）：韵律金字塔（Prosody Pyramid）与 Thought Groups（语调/思想意群）。
 *    - 每一个 Thought Group 表达一个统一的概念单元，包含一个核心焦点词（Focus Word），并在末尾自然停顿/微换气。
 * 2. Timothy Rasinski（阅读流利度权威）：Phrase-cued Text（意群线索文本）实证。
 *    - 阅读流利度 = 准确度 + 自动化 + 韵律断句（Prosody）。
 *    - 视觉意群切分让读者的默读内语（Inner Speech / Subvocal Prosody）与母语口语节奏同步，
 *      从而在大脑中打通「Read ↔ Speak ↔ Listen」的语音回路，防止逐词解码（Word-by-word decoding）导致认知过载。
 *
 * 工程契约：
 * 1. 严格无损：所有 chunk 拼接必须逐字符完全等于原文；
 * 2. 颗粒度：通常为 2 至 5 个词，天然契合人类工作记忆（Cowan 4±1）与口语呼吸节奏；
 * 3. 语义紧凑：紧密搭配、短语动词、复合词严禁撕裂。
 */

export interface PromptGranularity {
  granularity?: "fine" | "coarse";
}

const GRANULARITY_HINT: Record<"fine" | "coarse", string> = {
  fine: "Granularity: finer-grained thought groups (typically 2-4 words). Also split at secondary syntactic pause points.",
  coarse: "Granularity: broader thought groups (typically 4-6 words). Split only at major syntactic and clausal boundaries.",
};

export function buildSystemPrompt(): string {
  return [
    "You are an expert English reading and pronunciation coach specializing in Thought Groups (natural sense units) for language learners.",
    "",
    "Goal:",
    "Partition the input text into natural Thought Groups (intonation units / sense chunks) exactly as a fluent native speaker would group words when reading aloud or speaking with natural rhythm, cadence, and breath pauses.",
    "",
    "Key Phrasing Principles:",
    "1. Meaningful Cadence (Typically 3 to 6 words):",
    "   - A Thought Group must express a unified, coherent piece of meaning.",
    "   - AVOID OVER-FRAGMENTATION: Never chop text into tiny 1-2 word fragments (e.g. NEVER make isolated chunks out of 'argued that', 'in Nature', or 'the findings').",
    "   - AVOID RUN-ONS: Break long compound/complex sentences at natural pause points so each chunk is comfortable for working memory.",
    "2. Inseparable Semantic Units (DO NOT SPLIT):",
    "   - Keep verbs with their particles, prepositions, and short complements (e.g., 'look at the pictures', 'come up with a plan', 'pointed out that').",
    "   - Keep short prepositional modifiers with their head noun or verb (e.g., 'published in Nature last week', 'walked to school').",
    "   - Keep compound nouns, proper names, and fixed collocations intact (e.g., 'artificial intelligence', 'climate change', 'United States').",
    "   - Never isolate a determiner/article or conjunction (e.g., never separate 'the' or 'of').",
    "3. Where to Pause / Split:",
    "   - At punctuation marks (commas, dashes, semicolons, colons).",
    "   - Before clauses or coordinating conjunctions connecting distinct thoughts (e.g., 'because...', 'although...', 'and...', 'but...').",
    "   - Between a long complex subject and its predicate.",
    "",
    "Few-Shot Reference Examples:",
    "- Input: 'Microsoft CEO Satya Nadella announced the acquisition of the London-based startup yesterday morning.'",
    '  Output: {"chunks": ["Microsoft CEO Satya Nadella ", "announced the acquisition ", "of the London-based startup ", "yesterday morning."]}',
    "- Input: 'The researchers who conducted the study, which was published in Nature last week, argued that the findings could revolutionize cancer treatment.'",
    '  Output: {"chunks": ["The researchers who conducted the study, ", "which was published in Nature last week, ", "argued that the findings ", "could revolutionize cancer treatment."]}',
    "- Input: 'Before we run out of time, I would like to point out that we must come up with a realistic plan to deal with climate change.'",
    '  Output: {"chunks": ["Before we run out of time, ", "I would like to point out ", "that we must come up with a realistic plan ", "to deal with climate change."]}',
    "",
    "Strict Output Rules:",
    "1. Lossless Preservation: Output strictly JSON in the form {\"chunks\": [\"chunk1\", \"chunk2\", ...]}. Concatenating all chunks in order must reproduce the original text character-for-character, including all spaces and punctuation. Do NOT add, delete, or alter any character.",
    "2. No markdown wrappers or conversational filler outside the JSON.",
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
