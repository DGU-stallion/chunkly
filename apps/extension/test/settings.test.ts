import { describe, it, expect } from "vitest";
import { normalizeSettings } from "../src/storage.js";
import { DEFAULT_SETTINGS, PRESETS } from "../src/types.js";

/**
 * 设置模型的契约。
 *
 * 背景（一个真实的坑）：早期默认 presetId 是 "glm"，而设置页在字段为空时
 * 又兜底到 DEFAULT_SETTINGS（GLM 的地址与模型）。用户把 CommandCode 的
 * `user_...` key 粘进去，实际存下的却是 open.bigmodel.cn —— 智谱不认这个 key，
 * 返回 401，界面显示「API Key 无效」。
 *
 * 也就是说：**key 是对的，报错误导。** 默认值必须与唯一的真实用途一致，
 * 且只剩一个 provider 时不该让用户做选择。
 */

describe("设置默认值", () => {
  it("默认 provider 是 CommandCode（唯一的真实用途）", () => {
    expect(DEFAULT_SETTINGS.provider.baseURL).toBe("https://api.commandcode.ai/provider/v1");
    expect(DEFAULT_SETTINGS.provider.model).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("默认关掉 thinking（切分是浅层句法任务，开了只是变慢）", () => {
    expect(DEFAULT_SETTINGS.reasoningEffort).toBe("off");
  });

  it("GLM 已删除，只留 CommandCode 与本机网关", () => {
    expect(Object.keys(PRESETS)).toEqual(["commandcode", "local"]);
    expect(PRESETS.commandcode.baseURL).toBe("https://api.commandcode.ai/provider/v1");
    expect("glm" in PRESETS).toBe(false);
  });

  it("默认 apiKey 为空（绝不内置密钥）", () => {
    expect(DEFAULT_SETTINGS.provider.apiKey).toBe("");
  });
});

describe("旧配置迁移", () => {
  it("旧的 glm 配置迁移为 CommandCode（否则用户升级后仍然 401）", () => {
    const oldGlm = {
      presetId: "glm",
      provider: { baseURL: "https://open.bigmodel.cn/api/paas/v4/", apiKey: "user_abc", model: "glm-4.7-flash" },
    };

    const migrated = normalizeSettings(oldGlm);

    expect(migrated.presetId).toBe("commandcode");
    expect(migrated.provider.baseURL).toBe("https://api.commandcode.ai/provider/v1");
    // key 要保留：用户已经填过的东西不能丢
    expect(migrated.provider.apiKey).toBe("user_abc");
    // 模型换成 CommandCode 的，否则模型名在那边不存在
    expect(migrated.provider.model).toBe("deepseek/deepseek-v4.1-flash");
  });

  it("其他非法 presetId 也迁移为 CommandCode", () => {
    const weird = {
      presetId: "weird",
      provider: { baseURL: "https://open.bigmodel.cn/api/paas/v4/", apiKey: "k", model: "m" },
    };
    const migrated = normalizeSettings(weird);
    expect(migrated.presetId).toBe("commandcode");
    expect(migrated.provider.baseURL).toBe("https://api.commandcode.ai/provider/v1");
  });

  it("已是 CommandCode 的配置原样保留", () => {
    const good = {
      presetId: "commandcode",
      provider: {
        baseURL: "https://api.commandcode.ai/provider/v1",
        apiKey: "user_abc",
        model: "deepseek/deepseek-v4.1-flash",
      },
      reasoningEffort: "off",
    };
    expect(normalizeSettings(good)).toEqual(good);
  });

  it("空的 apiKey 不会被迁移过程弄脏", () => {
    const migrated = normalizeSettings({ presetId: "glm", provider: { baseURL: "x", apiKey: "", model: "y" } });
    expect(migrated.provider.apiKey).toBe("");
  });
});

describe("预设与 provider 必须自洽（401 的真正来源）", () => {
  it("presetId 已是 commandcode 但地址残留为智谱时，地址被纠正回 CommandCode", () => {
    const inconsistent = {
      presetId: "commandcode",
      provider: {
        baseURL: "https://open.bigmodel.cn/api/paas/v4/",
        apiKey: "user_abc",
        model: "glm-4.7-flash",
      },
    };

    const fixed = normalizeSettings(inconsistent);

    // 这条是核心：preset 是「用这套配置」的意思，不能让残留地址赢过它。
    // 早期实现只在 presetId 变化时才替换 provider，于是这种自相矛盾的配置
    // 会一路留到 background，拿 user_ key 去打智谱 → 401。
    expect(fixed.provider.baseURL).toBe("https://api.commandcode.ai/provider/v1");
    expect(fixed.provider.model).toBe("deepseek/deepseek-v4.1-flash");
    expect(fixed.provider.apiKey).toBe("user_abc");
  });

  it("local 预设同理，地址被纠正为本机网关", () => {
    const inconsistent = {
      presetId: "local",
      provider: { baseURL: "https://api.commandcode.ai/provider/v1", apiKey: "x", model: "y" },
    };
    expect(normalizeSettings(inconsistent).provider.baseURL).toBe("http://127.0.0.1:3425/v1");
  });

  it("custom 预设允许任意地址，不被纠正", () => {
    const custom = {
      presetId: "custom",
      provider: { baseURL: "https://api.openai.com/v1", apiKey: "sk-x", model: "gpt-4o-mini" },
    };
    expect(normalizeSettings(custom).provider.baseURL).toBe("https://api.openai.com/v1");
    expect(normalizeSettings(custom).provider.model).toBe("gpt-4o-mini");
  });
});
