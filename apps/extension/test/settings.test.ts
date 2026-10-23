import { describe, it, expect } from "vitest";
import { normalizeSettings } from "../src/storage.js";
import {
  DEFAULT_SETTINGS,
  OFFICIAL_BASE_URL,
  OFFICIAL_MODELS,
  DEFAULT_OFFICIAL_MODEL,
  isOfficialModel,
  effortForModel,
} from "../src/types.js";

/**
 * 设置的契约。
 *
 * 这组测试里最重要的一条是「用户改的模型必须能保存住」——
 * 它来自一个真实 bug：我为了修 401 加了「预设说了算」，让非 custom 模式
 * 一律用预设值覆盖存储值，结果用户把模型改成 glm，保存后重开设置页又被改回
 * deepseek，表现为「改了模型但保存不了」。
 */

describe("默认配置", () => {
  it("默认走官方端点，模型是 deepseek-v4.1-flash（切分质量最优）", () => {
    expect(DEFAULT_SETTINGS.mode).toBe("official");
    expect(DEFAULT_SETTINGS.provider.baseURL).toBe(OFFICIAL_BASE_URL);
    expect(DEFAULT_SETTINGS.provider.model).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("默认不内置任何密钥", () => {
    expect(DEFAULT_SETTINGS.provider.apiKey).toBe("");
  });

  it("官方可选模型为 DeepSeek 与 GLM 双选", () => {
    expect(OFFICIAL_MODELS.map((m) => m.id)).toEqual([
      "deepseek/deepseek-v4.1-flash",
      "z-ai/glm-5.3-flash",
    ]);
    expect(DEFAULT_OFFICIAL_MODEL).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("isOfficialModel 认官方模型，不认其他", () => {
    for (const m of OFFICIAL_MODELS) expect(isOfficialModel(m.id)).toBe(true);
    expect(isOfficialModel("gpt-5.6-luna")).toBe(false);
    expect(isOfficialModel("claude-haiku-5-5")).toBe(false);
    expect(isOfficialModel("")).toBe(false);
  });

  it("默认开启划词悬浮按钮（showBubbleTrigger 为 true）", () => {
    expect(DEFAULT_SETTINGS.showBubbleTrigger).toBe(true);
  });

  it("默认高亮风格为经典荧光笔（highlightStyle 为 highlighter）", () => {
    expect(DEFAULT_SETTINGS.highlightStyle).toBe("highlighter");
  });
});

describe("高亮视觉风格配置测试", () => {
  it("合法风格（highlighter, underline）均能正确保留", () => {
    const styles = ["highlighter", "underline"] as const;
    for (const style of styles) {
      const normalized = normalizeSettings({
        mode: "official",
        provider: DEFAULT_SETTINGS.provider,
        highlightStyle: style,
      });
      expect(normalized.highlightStyle).toBe(style);
    }
  });

  it("非法或缺失的高亮风格回落到默认 highlighter", () => {
    const invalid = normalizeSettings({
      mode: "official",
      provider: DEFAULT_SETTINGS.provider,
      highlightStyle: "rainbow-glow",
    });
    expect(invalid.highlightStyle).toBe("highlighter");

    const omitted = normalizeSettings({
      mode: "official",
      provider: DEFAULT_SETTINGS.provider,
    });
    expect(omitted.highlightStyle).toBe("highlighter");
  });
});

describe("用户的模型选择必须能保存住（回归：改了模型但保存不了）", () => {
  it("official 模式下用户选的 glm 模型，重读后仍是 glm", () => {
    const saved = {
      mode: "official",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "user_x", model: "z-ai/glm-5.3-flash" },
    };

    const reread = normalizeSettings(saved);

    expect(reread.provider.model).toBe("z-ai/glm-5.3-flash");
    expect(reread.provider.apiKey).toBe("user_x");
  });

  it("三个官方模型都能存住，不会被改回默认", () => {
    for (const m of OFFICIAL_MODELS) {
      const saved = {
        mode: "official",
        provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "k", model: m.id },
      };
      expect(normalizeSettings(saved).provider.model).toBe(m.id);
    }
  });

  it("官方模式下地址被固定为官方地址（残留地址不会导致 401）", () => {
    const stale = {
      mode: "official",
      provider: {
        baseURL: "https://open.bigmodel.cn/api/paas/v4/",
        apiKey: "user_x",
        model: "z-ai/glm-5.3-flash",
      },
    };

    const fixed = normalizeSettings(stale);

    expect(fixed.provider.baseURL).toBe(OFFICIAL_BASE_URL);
    // 模型仍然尊重用户选择，不被端点修正波及
    expect(fixed.provider.model).toBe("z-ai/glm-5.3-flash");
  });

  it("模型为空时才回落到默认", () => {
    const empty = {
      mode: "official",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "k", model: "" },
    };
    expect(normalizeSettings(empty).provider.model).toBe(DEFAULT_OFFICIAL_MODEL);
  });

  it("official 模式下如果存了已失效/非法的模型名，必须自动纠正为默认官方模型", () => {
    const invalid = {
      mode: "official",
      provider: {
        baseURL: OFFICIAL_BASE_URL,
        apiKey: "k",
        model: "commandcode-plan/deepseek/deepseek-v4.1-flash",
      },
    };
    expect(normalizeSettings(invalid).provider.model).toBe(DEFAULT_OFFICIAL_MODEL);
  });
});

describe("自定义模式", () => {
  it("三项完全尊重用户填写", () => {
    const custom = {
      mode: "custom" as const,
      provider: { baseURL: "https://api.openai.com/v1", apiKey: "sk-x", model: "gpt-4o-mini" },
      showBubbleTrigger: true,
      highlightStyle: "highlighter" as const,
    };
    expect(normalizeSettings(custom)).toEqual(custom);
  });

  it("自定义模式下也可以用非官方模型名", () => {
    const custom = {
      mode: "custom",
      provider: { baseURL: "http://x/v1", apiKey: "k", model: "任意模型名" },
    };
    expect(normalizeSettings(custom).provider.model).toBe("任意模型名");
  });
});

describe("划词悬浮按钮配置", () => {
  it("若用户显式关闭了 showBubbleTrigger，规整后保持 false", () => {
    const custom = {
      mode: "official",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "k", model: DEFAULT_OFFICIAL_MODEL },
      showBubbleTrigger: false,
    };
    expect(normalizeSettings(custom).showBubbleTrigger).toBe(false);
  });

  it("若未配置 showBubbleTrigger，默认回落为 true", () => {
    const raw = {
      mode: "official",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "k", model: DEFAULT_OFFICIAL_MODEL },
    };
    expect(normalizeSettings(raw).showBubbleTrigger).toBe(true);
  });
});

describe("旧配置迁移", () => {
  it("旧的 commandcode 迁移为 official，key 保留", () => {
    const old = {
      presetId: "commandcode",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "user_abc", model: "deepseek/deepseek-v4.1-flash" },
    };
    const migrated = normalizeSettings(old);
    expect(migrated.mode).toBe("official");
    expect(migrated.provider.apiKey).toBe("user_abc");
  });

  it("旧的 local 也迁移为 official（不再保留本地网关概念）", () => {
    const old = {
      presetId: "local",
      provider: { baseURL: "http://127.0.0.1:3425/v1", apiKey: "magpie", model: "x" },
    };
    const migrated = normalizeSettings(old);
    expect(migrated.mode).toBe("official");
    expect(migrated.provider.baseURL).toBe(OFFICIAL_BASE_URL);
  });

  it("旧的 glm 迁移为 official，模型被带过来（可能会在测试连接时暴露）", () => {
    const old = {
      presetId: "glm",
      provider: { baseURL: "https://open.bigmodel.cn/api/paas/v4/", apiKey: "k", model: "glm-4.7-flash" },
    };
    const migrated = normalizeSettings(old);
    expect(migrated.mode).toBe("official");
    expect(migrated.provider.baseURL).toBe(OFFICIAL_BASE_URL);
  });

  it("旧的 custom 迁移为 custom", () => {
    const old = {
      presetId: "custom",
      provider: { baseURL: "https://x/v1", apiKey: "k", model: "m" },
    };
    expect(normalizeSettings(old).mode).toBe("custom");
  });

  it("完全没有配置时给默认值", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
  });

  it("provider 损坏时不崩，回落默认", () => {
    const broken = { mode: "official", provider: { baseURL: 123 } };
    expect(normalizeSettings(broken).provider.baseURL).toBe(OFFICIAL_BASE_URL);
  });
});

describe("不提供推理强度选项", () => {
  it("配置里没有 reasoningEffort 字段（默认不传，由模型自己决定）", () => {
    expect(DEFAULT_SETTINGS).not.toHaveProperty("reasoningEffort");
    const withStale = {
      mode: "official",
      provider: { baseURL: OFFICIAL_BASE_URL, apiKey: "k", model: "z-ai/glm-5.3-flash" },
      reasoningEffort: "off",
    };
    expect(normalizeSettings(withStale)).not.toHaveProperty("reasoningEffort");
  });
});

describe("推理强度按模型写死（不暴露给用户）", () => {
  it("deepseek 配 off（它接受 off，2340ms vs low 5996ms）", () => {
    expect(effortForModel("deepseek/deepseek-v4.1-flash")).toBe("off");
  });

  it("glm 配 low（它不支持 off，传 off 会 400 并报 does not support reasoning_effort）", () => {
    expect(effortForModel("z-ai/glm-5.3-flash")).toBe("low");
  });

  it("未知模型不传 effort（交给服务端默认）", () => {
    expect(effortForModel("some-other-model")).toBeUndefined();
    expect(effortForModel("")).toBeUndefined();
  });
});
