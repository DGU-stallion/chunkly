/**
 * 规则法意群切分：秒出首屏的降级方案。
 *
 * 定位（重要）：这**不是** LLM 的替代品，而是为了让用户不必盯着空白等 2.4 秒。
 * 实测云端 LLM 有约 2.2–2.4s 的恒定前置开销，且与输出长度无关
 * （见 docs/优化清单.md 第 1.1 节）。规则法 <10ms 就能给出一版可用的切分，
 * LLM 结果到达后再平滑替换。
 *
 * 设计原则：
 * 1. **零依赖**。engine 必须保持无运行时依赖（CODING_STANDARDS.md），
 *    所以不引入 compromise 之类的 NLP 库，只用手写规则 + 词表。
 * 2. **只切不改**。只在原文中插入切点，不改写任何字符——与 LLM 路径同一契约。
 * 3. **宁可粗，不要错**。规则法不追求语言学精确，只求「明显好于逐词」。
 *    切错一个意群比切粗一个意群伤害大：读者会以为那是正确的分组。
 *
 * 切分优先级（从高到低）：
 *   句末标点 → 从句引导词 → 并列连词 → 介词/不定式 → 长度兜底
 */

/** 从句引导词：在这些词**之前**切分 */
const SUBORDINATORS = new Set([
  "who", "whom", "whose", "which", "that",
  "when", "where", "while", "because", "although", "though",
  "if", "unless", "since", "after", "before", "until", "whether",
  "as", "once", "whereas",
]);

/** 并列连词：在这些词**之前**切分 */
const CONJUNCTIONS = new Set(["and", "but", "or", "so", "yet", "nor"]);

/** 介词：在这些词**之前**切分（仅当该片段已足够长时） */
const PREPOSITIONS = new Set([
  "in", "on", "at", "by", "for", "with", "from", "to", "into",
  "about", "over", "under", "through", "during", "against", "between",
  "among", "without", "within", "across", "along", "beyond", "toward", "towards",
]);

/**
 * 高频动词表：只用于识别「短语动词的动词成分」（如 switch on、put off、take over）。
 * 不求完整，只覆盖常见的，避免 `switch / on` 这类最刺眼的错切。
 */
const COMMON_VERBS = new Set([
  "switch", "turn", "put", "take", "give", "get", "go", "come", "look", "make",
  "pick", "set", "run", "break", "bring", "call", "carry", "cut", "drop", "figure",
  "fill", "find", "focus", "give", "hand", "hold", "keep", "let", "move", "pass",
  "pay", "point", "pull", "push", "reach", "rely", "send", "show", "shut", "sign",
  "sort", "stand", "start", "stay", "stick", "stop", "throw", "try", "use", "wake",
  "work", "write", "end", "check", "think", "talk", "speak", "read", "write",
]);

/** 冠词/限定词：绝不作为切点（切开了会读成 "The / quick brown fox"） */
const DETERMINERS = new Set([
  "the", "a", "an", "this", "that", "these", "those",
  "my", "your", "his", "her", "its", "our", "their",
]);

/**
 * 短语动词的副词性小品词：绝不作为切点。
 * 切开会把 "switch / on" 这种固定搭配拆成两半，这是最明显的错切类型。
 */
const PARTICLES = new Set([
  "on", "off", "up", "down", "in", "out", "over", "away",
  "back", "through", "along", "around", "about", "by",
]);

/** 一个意群的目标词数下限。低于此不切，避免碎片化。 */
const MIN_WORDS = 3;
/** 硬上限：超过此值即使不在候选边界也切。 */
const HARD_MAX_WORDS = 7;

interface WordToken {
  /** 词（去掉前后标点、小写化） */
  norm: string;
  /** 在原文中的起始位置 */
  start: number;
  /** 在原文中的结束位置（不含） */
  end: number;
}

/**
 * 切分入口。返回按顺序拼接等于原文的字符串数组。
 *
 * 两遍算法（这是关键，单遍会切得很碎）：
 *
 * 1. **标记候选边界**：句末标点、从句引导词前、并列连词前、介词短语前、
 *    从句内部的分词/不定式前。这些是“语法上说得通”的切点。
 * 2. **贪心组合**：从头累加词数，达到 MIN_WORDS 之后，遇到候选边界就切。
 *
 * 为什么不能单遍「边扫描边判」：那一版在短句上会把 "It is a habit built"
 * 切碎成逐词，而且当词数超限时只能在当前 token 硬切（可能切在短语中间）。
 * 两遍算法只在候选边界上切，而且超限时可以等到下一个候选点。
 */
export function chunkByRules(text: string): string[] {
  if (text.length === 0) return [];

  const tokens = tokenize(text);
  if (tokens.length === 0) return [text];

  const candidates = findCandidateBoundaries(text, tokens);
  return groupIntoCchunks(text, tokens, candidates);
}

/** 第一遍：找出所有语法上合理的切点（tokens[i] 之前） */
function findCandidateBoundaries(text: string, tokens: WordToken[]): Set<number> {
  const candidates = new Set<number>();

  for (let i = 1; i < tokens.length; i++) {
    const prev = tokens[i - 1];
    const cur = tokens[i];

    // 句末标点之后：无条件候选
    if (endsSentence(text, prev.end, cur.start)) {
      candidates.add(i);
      continue;
    }

    // 冠词/限定词之前：绝不切
    if (DETERMINERS.has(cur.norm)) continue;

    // 短语动词的小品词：上一词像动词时不切
    if (PARTICLES.has(cur.norm) && isVerblike(prev.norm)) continue;

    if (
      SUBORDINATORS.has(cur.norm) ||
      CONJUNCTIONS.has(cur.norm) ||
      PREPOSITIONS.has(cur.norm) ||
      // 分词/不定式短语前："...stop, / decode it / letter by letter"
      (/ing$/.test(cur.norm) && cur.norm.length > 4) ||
      cur.norm === "to"
    ) {
      candidates.add(i);
    }
  }

  return candidates;
}

/**
 * 第二遍：贪心组合成意群。
 *
 * 规则：
 * - 词数 < MIN_WORDS：不切（否则太碎，读者退回逐词模式）
 * - 词数 >= SOFT_MAX：等不到候选边界也切（防止一个意群无限长）
 * - 否则只在候选边界上切
 */
function groupIntoCchunks(
  text: string,
  tokens: WordToken[],
  candidates: Set<number>
): string[] {
  const cuts: number[] = [];
  let wordsInChunk = 1;

  for (let i = 1; i < tokens.length; i++) {
    const isCandidate = candidates.has(i);
    wordsInChunk++;

    if (isCandidate && wordsInChunk >= MIN_WORDS) {
      cuts.push(tokens[i].start);
      wordsInChunk = 0;
    } else if (wordsInChunk >= HARD_MAX_WORDS) {
      // 硬上限：即使不在候选边界也要切，避免一个意群长到读不动
      cuts.push(tokens[i].start);
      wordsInChunk = 0;
    }
  }

  return sliceAtCuts(text, cuts);
}

/**
 * 上一词是否像动词（用于识别短语动词）。
 *
 * 不用词性标注（会引入依赖），用两个启发式：
 * - 常见动词词尾（-ed / -ing）或常见高频动词表；
 * - 以 -s / -e / -t 结尾的短词也可能是动词，但误判代价小（只是少切一次）。
 */
function isVerblike(word: string): boolean {
  if (COMMON_VERBS.has(word)) return true;
  if (/(ed|ing)$/.test(word) && word.length > 3) return true;
  return false;
}

/** prev 与 cur 之间是否有句末标点 */
function endsSentence(text: string, prevEnd: number, curStart: number): boolean {
  const between = text.slice(prevEnd, curStart);
  return /[.!?…]/.test(between);
}

/** 按切点位置把原文切成若干段（保留所有空白，保证无损） */
function sliceAtCuts(text: string, cuts: number[]): string[] {
  const sorted = Array.from(new Set(cuts)).sort((a, b) => a - b);
  const out: string[] = [];
  let cursor = 0;

  for (const cut of sorted) {
    if (cut <= cursor || cut >= text.length) continue;
    out.push(text.slice(cursor, cut));
    cursor = cut;
  }
  if (cursor < text.length) {
    out.push(text.slice(cursor));
  }

  return out.filter((s) => s.length > 0);
}

/**
 * 把文本切成词 token（记录位置）。
 * 只做 ASCII 字母/数字/撇号/连字符的切分，足以覆盖英文意群场景。
 */
function tokenize(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  const re = /[A-Za-z0-9][A-Za-z0-9''\-]*/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      norm: m[0].toLowerCase().replace(/^['']|['']$/g, ""),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}
