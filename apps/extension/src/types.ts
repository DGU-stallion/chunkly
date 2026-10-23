/**
 * 插件本地类型定义与 provider 预设。
 *
 * 设置模型只有两个分支，这是刻意的：
 *
 * - **official（官方）**：走 Chunkly 自己配置的 CommandCode 端点。
 *   用户**不需要也不应该看到或填写 Key**——官方模式用开发者自己的配额，
 *   在设置页放一个 Key 输入框等于把开发者的密钥交给每个用户。
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
 * 官方模式下可选的模型（CommandCode 直连，实测 DeepSeek 切分质量最优）。
 *
 * 官方精简预设，不给自由输入：新用户不会填错一个不存在的模型名而卡在报错上。
 * 想试别的模型的人可以走「自定义」——那里可以填任意地址和模型名。
 */
export const OFFICIAL_MODELS = [
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    note: "默认 · 意群切分效果最优",
    effort: "off",
  },
  {
    id: "z-ai/glm-5.3-flash",
    label: "GLM-5.3 Flash",
    note: "极速响应",
    /**
     * 不支持 off —— 传 off 会 HTTP 400
     * `Model "z-ai/glm-5.3-flash" does not support reasoning_effort`
     * low 已被服务端视作无 reasoning（实测 reasoning_tokens=0）。
     */
    effort: "low",
  },
] as const;

/** 默认模型：DeepSeek V4.1 Flash（意群切分质量最优） */
export const DEFAULT_OFFICIAL_MODEL: OfficialModelId = "deepseek/deepseek-v4.1-flash";

/** 取某个模型对应的最优 reasoning_effort；未知模型返回 undefined（不传）。 */
export function effortForModel(model: string): string | undefined {
  return OFFICIAL_MODELS.find((m) => m.id === model)?.effort;
}

export type OfficialModelId = (typeof OFFICIAL_MODELS)[number]["id"];

/**
 * 意群视觉呈现风格：
 * - highlighter: 经典莫兰迪实体荧光笔（默认）
 * - underline: 极简清晰下划线（无底色干扰）
 */
export type HighlightStyle = "highlighter" | "underline";

export interface StoredSettings {
  /** "official" 用官方端点（只选模型）；"custom" 全部自己填 */
  mode: "official" | "custom";
  provider: ProviderConfig;
  /** 划词悬浮按钮：划选文本后是否显示浮动 Chunk 按钮 */
  showBubbleTrigger?: boolean;
  /** 高亮视觉风格偏好 */
  highlightStyle?: HighlightStyle;
}

/**
 * 默认配置。
 *
 * apiKey 为空是刻意的：官方模式的 Key **不进入设置页**，
 * 而由构建时注入（见 vite.config 的 define 与 background.ts）。
 */
export const DEFAULT_SETTINGS: StoredSettings = {
  mode: "official",
  provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "", model: DEFAULT_OFFICIAL_MODEL },
  showBubbleTrigger: true,
  highlightStyle: "highlighter",
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

/** 构建时由 vite.background.config.ts 的 define 注入的官方 Key（仅 background 可见） */
declare global {
  const __CHUNKLY_OFFICIAL_API_KEY__: string;
}
