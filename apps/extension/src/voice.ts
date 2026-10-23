/**
 * 高品质母语语音智能优选引擎（借鉴《沉浸式翻译》同款语音优选规则库）。
 *
 * 核心设计：
 * 1. 坚决排除系统远古恶搞/低采样率机械音（如 Albert, Bad News, Fred, Wobble 等）；
 * 2. 梯级优选真人母语级音色：
 *    - 梯队 1：Microsoft Natural 神经音色（如 Jenny/Guy Natural，Windows/Edge 标配顶级真人音）；
 *    - 梯队 2：Google 神经音色（如 Google US English，Chrome 标配 44.1kHz 清晰女声）；
 *    - 梯队 3：Apple Enhanced / Premium 增强音色（如 Samantha Enhanced, Ava Premium, Daniel）；
 * 3. 严格解耦 DOM，可在 Node / JSDOM 环境下完整单测。
 */

export interface VoiceDescriptor {
  name: string;
  lang: string;
  default?: boolean;
}

const NOVELTY_REGEX =
  /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Pipe Organ|Trinoids|Whisper|Wobble|Zarvox|Fred)$/i;

/** 判定是否为系统恶搞或低采样率机械音 */
export function isNoveltyVoice(name: string): boolean {
  return NOVELTY_REGEX.test(name.trim());
}

/** 音色优先级模式库 */
const PRIORITY_PATTERNS: RegExp[] = [
  // 1. 微软 Natural / 神经音色（真人播音级）
  /Online \(Natural\)/i,
  /Jenny.*Natural/i,
  /Guy.*Natural/i,
  /Aria.*Natural/i,

  // 2. Google 高清神经原声（Chrome 浏览器自带 44.1kHz 神经音色）
  /^Google US English/i,
  /^Google UK English/i,
  /^Google/i,

  // 3. Apple 增强型母语真人音色（macOS / iOS Enhanced or Premium）
  /Enhanced/i,
  /Premium/i,
  /Samantha/i,
  /Ava/i,
  /Daniel/i,
  /Karen/i,
  /Zoe/i,
  /Tom/i,
  /Moira/i,
];

/** 从系统可用音色列表中智能筛选出最高品质的母语者发音 */
export function pickBestVoice<T extends VoiceDescriptor>(
  voices: readonly T[],
  preferredLang = "en-US"
): T | null {
  if (voices.length === 0) return null;

  // 1. 过滤掉恶搞与破锣机械音，并优先匹配语言前缀（如 "en"）
  const langPrefix = preferredLang.slice(0, 2).toLowerCase();
  const cleanLangCandidates = voices.filter(
    (v) =>
      v.lang.toLowerCase().startsWith(langPrefix) &&
      !isNoveltyVoice(v.name)
  );

  const pool =
    cleanLangCandidates.length > 0
      ? cleanLangCandidates
      : voices.filter((v) => !isNoveltyVoice(v.name));

  if (pool.length === 0) {
    return voices[0] ?? null;
  }

  // 2. 精确区域优先（如请求 en-US 优先在 en-US 中查找）
  const exactLangPool = pool.filter(
    (v) => v.lang.toLowerCase() === preferredLang.toLowerCase()
  );
  const searchPool = exactLangPool.length > 0 ? exactLangPool : pool;

  // 3. 逐层命中优先级规则
  for (const pattern of PRIORITY_PATTERNS) {
    const found = searchPool.find((v) => pattern.test(v.name));
    if (found) return found;
  }

  // 4. 兜底返回第一个非恶搞正常音色
  return searchPool[0] ?? null;
}
