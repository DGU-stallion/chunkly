/**
 * 插件本地类型定义与 provider 预设。
 */
import type { ProviderConfig } from "@chunkly/engine";

export interface StoredSettings {
  /**
   * "commandcode" 直连 CommandCode（api.commandcode.ai），自带订阅额度、不限流、可关 thinking
   * "local"       本机 OpenAI 兼容网关（如 magpie）
   * "custom"      完全自定义三项
   */
  presetId: "commandcode" | "local" | "custom";
  provider: ProviderConfig;
  /** 透传给 Provider 的推理强度；"off" 可关掉 thinking（延迟减半） */
  reasoningEffort?: "off" | "low" | "medium" | "high";
}

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
 * 本机网关预设。
 * 注意：请求必须从 background service worker 发出（origin = chrome-extension://），
 * 从 content script 发出会带页面 origin，被网关以 permission_error 拒绝。见 background.ts。
 */
export const LOCAL_PRESET: Pick<ProviderConfig, "baseURL" | "model"> = {
  baseURL: "http://127.0.0.1:3425/v1",
  /**
   * 实测（2026-10-21，本机网关）各模型中 claude-haiku-5-5 最快且稳定：
   *   中位 1234ms / 3 次全可用 / 9 chunks / 5.8 词每意群（max 8）
   * 对比（同一 340 字段落、同 prompt、各 3 次取中位）：
   *   glm-5.3-flash      2458ms  7ch / 7.4w（偏粗）
   *   z-ai/glm-5.3-flash 2628ms  8ch / 6.5w（偏粗）
   *   gpt-6-luna         3788ms 11ch / 4.7w
   *   deepseek-v4.1-flash 5070ms 13ch / 4w
   * 注意：haiku 传 reasoning_effort=off 反而变慢（1234ms → 2847ms），
   * 所以 local 预设的 effort 置空（见 PRESET_EFFORT）。
   */
  model: "commandcode-plan/claude-haiku-5-5",
};

/**
 * 各预设推荐的推理强度。
 * local 置空是因为实测 haiku 关 thinking 反而慢一倍，
 * 而 commandcode 的 deepseek-v4.1-flash 关 thinking 确实减半。
 */
export const PRESET_EFFORT: Record<StoredSettings["presetId"], string> = {
  commandcode: "off",
  local: "",
  custom: "",
};

/**
 * 所有可选预设。GLM 已删除：
 * 它需要另申请 key、免费额度实测频繁 429、且不支持 `reasoning_effort=off`
 * （传了直接 400）。保留它只会让用户填错 key 却没地方发现。
 */
export const PRESETS = {
  commandcode: COMMANDCODE_PRESET,
  local: LOCAL_PRESET,
} as const;

/**
 * 默认配置。必须是**唯一的真实用途**，否则用户会填对 key 却用错地址。
 *
 * 历史蚊坑：默认曾是 GLM，而设置页在字段为空时又兜底到默认值，
 * 导致用户粘上 CommandCode 的 `user_...` key 后，实际存的是 open.bigmodel.cn，
 * 智谱返回 401，界面却提示「API Key 无效」——key 是对的，报错误导。
 */
export const DEFAULT_SETTINGS: StoredSettings = {
  presetId: "commandcode",
  provider: { ...COMMANDCODE_PRESET, apiKey: "" },
  reasoningEffort: "off",
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
