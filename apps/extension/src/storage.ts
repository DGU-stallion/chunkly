/**
 * chrome.storage.local 的读写封装 + 纯序列化逻辑。
 * 序列化/校验部分与 chrome API 解耦，方便在 jsdom 下单测。
 */
import {
  DEFAULT_SETTINGS,
  OFFICIAL_BASE_URL,
  DEFAULT_OFFICIAL_MODEL,
  migratePresetId,
  type StoredSettings,
} from "./types.js";

const STORAGE_KEY = "chunkly.settings";

/**
 * 把任意存储读出的值规整为合法的 StoredSettings。
 *
 * 核心不变量：**用户显式选过的东西必须活下来。**
 *
 * 这条不变量是被一个真实 bug 逼出来的：修 401 时我加了「预设说了算」——
 * 非 custom 预设一律用预设的 baseURL/model 覆盖存储值。结果用户把模型从
 * deepseek 改成 glm，保存后存储里确实变了，但**重新打开设置页又被改回 deepseek**，
 * 表现为「改了模型但保存不了」。
 *
 * 正确的分工是：
 * - **端点**（baseURL）由 mode 决定，不让用户改错的地址留存；
 * - **模型**是用户的选择，必须尊重，只在缺失/非法时才回落到默认；
 * - **apiKey** 是用户填的，永远尊重。
 */
export function normalizeSettings(raw: unknown): StoredSettings {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_SETTINGS;
  }

  const candidate = raw as Record<string, unknown>;
  const provider = candidate.provider as Record<string, unknown> | undefined;
  const hasValidProvider =
    typeof provider === "object" &&
    provider !== null &&
    typeof provider.baseURL === "string" &&
    typeof provider.apiKey === "string" &&
    typeof provider.model === "string";

  // 兼容旧版的 presetId 字段
  const rawMode = candidate.mode ?? candidate.presetId;
  const mode: StoredSettings["mode"] =
    rawMode === "custom" || rawMode === "official"
      ? rawMode
      : migratePresetId(rawMode);

  if (!hasValidProvider) {
    return { ...DEFAULT_SETTINGS, mode };
  }

  const baseURL = provider.baseURL as string;
  const apiKey = provider.apiKey as string;
  const model = provider.model as string;

  if (mode === "custom") {
    // 自定义：三项都尊重用户，只在为空时给一个可用的起点
    return {
      mode,
      provider: {
        baseURL: baseURL || OFFICIAL_BASE_URL,
        apiKey,
        model: model || DEFAULT_OFFICIAL_MODEL,
      },
    };
  }

  // official：端点固定为官方地址（避免残留地址导致 401），
  // 但**模型保留用户的选择**（这正是之前「改了保存不了」的原因）。
  return {
    mode,
    provider: {
      baseURL: OFFICIAL_BASE_URL,
      apiKey,
      model: model || DEFAULT_OFFICIAL_MODEL,
    },
  };
}

export async function loadSettings(): Promise<StoredSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  const normalized = normalizeSettings(raw);

  // 把规整后的值写回存储，让「显示的 / 存的 / 实际用的」永远是同一份。
  // 不写回的话，存储里会一直留着自相矛盾的旧配置，排查时看到的不是实际用的值。
  if (!sameSettings(raw, normalized)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  }

  return normalized;
}

function sameSettings(a: unknown, b: StoredSettings): boolean {
  if (typeof a !== "object" || a === null) return false;
  const x = a as Partial<StoredSettings>;
  return (
    x.mode === b.mode &&
    x.provider?.baseURL === b.provider.baseURL &&
    x.provider?.apiKey === b.provider.apiKey &&
    x.provider?.model === b.provider.model
  );
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export { STORAGE_KEY };
