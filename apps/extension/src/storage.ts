/**
 * chrome.storage.local 的读写封装 + 纯序列化逻辑。
 * 序列化/校验部分与 chrome API 解耦，方便在 jsdom 下单测。
 */
import {
  DEFAULT_SETTINGS,
  PRESETS,
  COMMANDCODE_PRESET,
  type StoredSettings,
} from "./types.js";

const STORAGE_KEY = "chunkly.settings";

/** 把任意存储读出的值规整为合法的 StoredSettings，非法/缺失字段回退默认值。 */
export function normalizeSettings(raw: unknown): StoredSettings {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_SETTINGS;
  }
  const candidate = raw as Partial<StoredSettings>;
  const provider = candidate.provider;
  const hasValidProvider =
    typeof provider === "object" &&
    provider !== null &&
    typeof (provider as any).baseURL === "string" &&
    typeof (provider as any).apiKey === "string" &&
    typeof (provider as any).model === "string";

  const effort = candidate.reasoningEffort;
  const reasoningEffort =
    effort === "off" || effort === "low" || effort === "medium" || effort === "high"
      ? effort
      : undefined;

  if (!hasValidProvider) {
    // provider 缺失/损坏时，仍保留用户可能已经填过的 apiKey 没有意义（读不到），
    // 直接给默认配置，但**保留 reasoningEffort**（它独立于 provider）。
    return {
      ...DEFAULT_SETTINGS,
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };
  }

  const presetId = normalizePresetId(candidate.presetId);

  // 非 custom 预设一律以预设值为准，**只保留 apiKey**。
  //
  // 这里是 401 的真正源头：早期实现只在 presetId 变化时才替换 provider，
  // 于是「presetId=commandcode 但 baseURL 残留为智谱」这种自相矛盾的配置
  // 会一路漏到 background，拿 user_ key 去打智谱 → 401，界面还提示「Key 无效」。
  //
  // 现在明确一条不变量：**预设说了算**。选了一个预设，就用它的地址和模型；
  // 想用别的地址，就选 custom。这样「预设与 provider 不自洽」在类型层面就不可能存在。
  if (presetId !== "custom") {
    return {
      presetId,
      provider: { ...PRESETS[presetId], apiKey: provider.apiKey },
      ...(reasoningEffort ? { reasoningEffort } : {}),
    };
  }

  // custom：完全尊重用户填的三项
  return {
    presetId,
    provider: {
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
      model: provider.model,
    },
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

/**
 * 把任意 presetId 规整为受支持的值。
 *
 * 旧版的 "glm" 和任何未知值都落到 "commandcode"——它是唯一开箱可用的预设，
 * 落到这里最不容易让用户卡在一个 401 上。
 */
function normalizePresetId(raw: unknown): StoredSettings["presetId"] {
  if (raw === "commandcode" || raw === "local" || raw === "custom") {
    return raw;
  }
  return "commandcode";
}

export async function loadSettings(): Promise<StoredSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  const normalized = normalizeSettings(raw);

  // 把规整后的值写回存储：让「显示的」「存的」「实际用的」三者永远是同一份。
  //
  // 为什么必须写回：只在内存里规整的话，存储里会一直留着一份自相矛盾的旧配置。
  // 用户下次打开设置页看到的是纠正好但未保存的值，一旦他又单击保存又可能覆盖回去；
  // 而且排查时看存储看到的是旧值，会把「实际用的配置是什么」搞乱。
  if (!sameSettings(raw, normalized)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
  }

  return normalized;
}

function sameSettings(a: unknown, b: StoredSettings): boolean {
  if (typeof a !== "object" || a === null) return false;
  const x = a as Partial<StoredSettings>;
  return (
    x.presetId === b.presetId &&
    x.reasoningEffort === b.reasoningEffort &&
    x.provider?.baseURL === b.provider.baseURL &&
    x.provider?.apiKey === b.provider.apiKey &&
    x.provider?.model === b.provider.model
  );
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export { STORAGE_KEY, COMMANDCODE_PRESET };
