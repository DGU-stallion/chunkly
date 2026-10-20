/**
 * 插件本地类型定义与 provider 预设。
 */
import type { ProviderConfig } from "@chunkly/engine";

export interface StoredSettings {
  /** "glm" 使用内置预设 baseURL/model（apiKey 仍需用户自行填写）；"custom" 完全自定义三项 */
  presetId: "glm" | "custom";
  provider: ProviderConfig;
}

export const GLM_PRESET: Pick<ProviderConfig, "baseURL" | "model"> = {
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
  model: "glm-4.7-flash",
};

export const DEFAULT_SETTINGS: StoredSettings = {
  presetId: "glm",
  provider: { baseURL: GLM_PRESET.baseURL, apiKey: "", model: GLM_PRESET.model },
};
