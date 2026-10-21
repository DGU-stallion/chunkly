/**
 * 插件本地类型定义与 provider 预设。
 */
import type { ProviderConfig } from "@chunkly/engine";

export interface StoredSettings {
  /**
   * "commandcode" 直连 CommandCode（api.commandcode.ai），自带订阅额度、不限流、可关 thinking
   * "glm"         智谱官方 API（需自己申请 Key，免费额度实测频繁 429）
   * "local"       本机 OpenAI 兼容网关（如 magpie）
   * "custom"      完全自定义三项
   */
  presetId: "commandcode" | "glm" | "local" | "custom";
  provider: ProviderConfig;
  /** 透传给 Provider 的推理强度；"off" 可关掉 thinking（延迟减半） */
  reasoningEffort?: "off" | "low" | "medium" | "high";
}

export const GLM_PRESET: Pick<ProviderConfig, "baseURL" | "model"> = {
  baseURL: "https://open.bigmodel.cn/api/paas/v4/",
  model: "glm-4.7-flash",
};

/**
 * CommandCode 直连（不经 magpie 网关）。
 * 实测：baseURL = https://api.commandcode.ai/provider/v1，Bearer + 计划 key（user_ 开头）；
 * 模型 ID 带厂商前缀（deepseek/... 、z-ai/...、zai-org/...）。
 * 默认配 effort=off：1967ms / 0 reasoning token（开 thinking 则 3974ms / 303 token）。
 */
export const COMMANDCODE_PRESET: Pick<ProviderConfig, "baseURL" | "model"> = {
  baseURL: "https://api.commandcode.ai/provider/v1",
  model: "deepseek/deepseek-v4.1-flash",
};

/**
 * 本机网关预设。默认指向 magpie 的 127.0.0.1:3425 与 commandcode-plan 的 deepseek-flash。
 * 注意：请求必须从 background service worker 发出（origin = chrome-extension://），
 * 从 content script 发出会带页面 origin，被网关以 permission_error 拒绝。见 background.ts。
 */
export const LOCAL_PRESET: Pick<ProviderConfig, "baseURL" | "model"> = {
  baseURL: "http://127.0.0.1:3425/v1",
  model: "commandcode-plan/deepseek/deepseek-v4.1-flash",
};

export const DEFAULT_SETTINGS: StoredSettings = {
  presetId: "glm",
  provider: { baseURL: GLM_PRESET.baseURL, apiKey: "", model: GLM_PRESET.model },
};
/** background <-> content 之间的消息协议 */
export interface ChunkRequestMessage {
  type: "CHUNKLY_CHUNK";
  text: string;
}

export type ChunkResponseMessage =
  | {
      ok: true;
      chunks: Array<{ text: string; startOffset: number; endOffset: number }>;
      /** 是否命中缓存（用于提示用户，不必重复付费） */
      cached: boolean;
    }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };
