/**
 * 插件本地类型定义与 provider 预设。
 *
 * 设置模型只有两个分支，这是刻意的：
 *
 * - **official（官方）**：走 Chunkly 自己配置的 CommandCode 端点，用户不需要
 *   也**不应该**碰地址和 Key（插件对外发布后，让用户填本地网关地址毫无意义）。
 *   用户唯一的选择是模型，从实测可用的三个里挑。
 * - **custom（自定义）**：愿意自己配的人填 baseURL / apiKey / model。
 *
 * 为什么不再提供「本机网关」预设：这个插件是要对外发布的。让外部用户
 * 配置 `127.0.0.1:3425` 只会造成困惑。本地网关是开发期的便利，不是产品功能。
 *
 * 关于推理强度：**不暴露给用户**。实测结论是「关 thinking 是否更快」因模型而异
 * （deepseek 关掉快一倍，haiku 关掉反而慢一倍），把这个取舍丢给用户是设计缺陷。
 * 现在统一**默认不传 thinking 相关参数**，由各模型走自己的默认。
 */
import type { ProviderConfig } from "@chunkly/engine";

/** 官方端点。插件发布时使用这一份；用户不需要看到。 */
export const OFFICIAL_BASE_URL = "https://api.commandcode.ai/provider/v1";

/**
 * 官方模式下可选的模型（CommandCode 直连，2026-10-21 实测均可用）。
 *
 * 只给三个，不给自由输入：新用户不会填错一个不存在的模型名而卡在报错上。
 * 想试别的模型的人可以走「自定义」——那里可以填任意地址和模型名。
 */
export const OFFICIAL_MODELS = [
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM-5.3 Flash",
    note: "默认。中文语感好，速度与粒度平衡",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    note: "切分更细（约 4 词/意群）",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    note: "粒度居中，稳定性好",
  },
] as const;

export type OfficialModelId = (typeof OFFICIAL_MODELS)[number]["id"];

export const DEFAULT_OFFICIAL_MODEL: OfficialModelId = "z-ai/glm-5.3-flash";

export interface StoredSettings {
  /** "official" 用官方端点（只选模型）；"custom" 全部自己填 */
  mode: "official" | "custom";
  provider: ProviderConfig;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  mode: "official",
  provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "", model: DEFAULT_OFFICIAL_MODEL },
};

/**
 * 旧版本的 presetId（含已删除的 glm/local）到新模式名的映射。
 *
 * "local" 也要迁移到 official：对外发布后不能保留本地网关概念。
 * 但**保留用户已经填过的 apiKey**（如果是 user_ 开头的 CommandCode key，
 * 直接就能用；不是的话用户会在测试连接时被明确告知）。
 */
export function migratePresetId(raw: unknown): "official" | "custom" {
  return raw === "custom" ? "custom" : "official";
}

/** 官方模型 id 是否受支持 */
export function isOfficialModel(model: string): model is OfficialModelId {
  return OFFICIAL_MODELS.some((m) => m.id === model);
}

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
