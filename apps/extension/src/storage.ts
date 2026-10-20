/**
 * chrome.storage.local 的读写封装 + 纯序列化逻辑。
 * 序列化/校验部分与 chrome API 解耦，方便在 jsdom 下单测。
 */
import { DEFAULT_SETTINGS, type StoredSettings } from "./types.js";

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

  if (!hasValidProvider) {
    return DEFAULT_SETTINGS;
  }
  const presetId = candidate.presetId === "custom" ? "custom" : "glm";
  return { presetId, provider: provider as StoredSettings["provider"] };
}

export async function loadSettings(): Promise<StoredSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY]);
}

export async function saveSettings(settings: StoredSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export { STORAGE_KEY };
