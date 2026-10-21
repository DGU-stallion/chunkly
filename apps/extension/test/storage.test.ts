import { describe, it, expect } from "vitest";
import { normalizeSettings } from "../src/storage.js";
import { DEFAULT_SETTINGS } from "../src/types.js";

describe("normalizeSettings", () => {
  it("合法的自定义配置原样通过", () => {
    const input = {
      presetId: "custom",
      provider: { baseURL: "https://api.openai.com/v1", apiKey: "sk-abc", model: "gpt-4o-mini" },
    };
    expect(normalizeSettings(input)).toEqual(input);
  });

  it("presetId 为 local 时地址与模型以预设为准，apiKey 保留", () => {
    const input = {
      presetId: "local",
      provider: { baseURL: "http://127.0.0.1:3425/v1", apiKey: "magpie", model: "deepseek" },
    };
    const result = normalizeSettings(input);
    expect(result.presetId).toBe("local");
    expect(result.provider.baseURL).toBe("http://127.0.0.1:3425/v1");
    expect(result.provider.apiKey).toBe("magpie");
    // 模型以预设为准：用户手写的 "deepseek" 在网关侧不存在，会 404
    expect(result.provider.model).toBe("commandcode-plan/deepseek/deepseek-v4.1-flash");
  });

  it("presetId 为 commandcode 时保留", () => {
    const input = {
      presetId: "commandcode",
      provider: {
        baseURL: "https://api.commandcode.ai/provider/v1",
        apiKey: "user_x",
        model: "deepseek/deepseek-v4.1-flash",
      },
    };
    expect(normalizeSettings(input)).toEqual(input);
  });

  it("合法的 reasoningEffort 保留，非法值丢弃", () => {
    const base = { presetId: "custom", provider: { baseURL: "u", apiKey: "k", model: "m" } };
    expect(normalizeSettings({ ...base, reasoningEffort: "off" }).reasoningEffort).toBe("off");
    expect(normalizeSettings({ ...base, reasoningEffort: "nonsense" }).reasoningEffort).toBeUndefined();
  });

  it("presetId 非受支持值时回退为 commandcode，且 provider 一并换成该预设", () => {
    const input = {
      presetId: "weird",
      provider: { baseURL: "https://x", apiKey: "k", model: "m" },
    };
    const result = normalizeSettings(input);
    expect(result.presetId).toBe("commandcode");
    // 只改 id 不改 provider 会留下「id=commandcode、地址=https://x」的矛盾配置
    expect(result.provider.baseURL).toBe("https://api.commandcode.ai/provider/v1");
    expect(result.provider.apiKey).toBe("k");
  });

  it("缺少 provider 字段时回退默认配置", () => {
    expect(normalizeSettings({ presetId: "custom" })).toEqual(DEFAULT_SETTINGS);
  });

  it("provider 字段类型不对时回退默认配置", () => {
    expect(normalizeSettings({ provider: { baseURL: 123, apiKey: "k", model: "m" } })).toEqual(
      DEFAULT_SETTINGS
    );
  });

  it("输入为 null/非对象时回退默认配置", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("garbage")).toEqual(DEFAULT_SETTINGS);
  });
});
