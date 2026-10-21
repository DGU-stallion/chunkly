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

  it("presetId 为 local 时保留（本机网关预设）", () => {
    const input = {
      presetId: "local",
      provider: { baseURL: "http://127.0.0.1:3425/v1", apiKey: "magpie", model: "deepseek" },
    };
    expect(normalizeSettings(input)).toEqual(input);
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
    const base = { presetId: "commandcode", provider: { baseURL: "u", apiKey: "k", model: "m" } };
    expect(normalizeSettings({ ...base, reasoningEffort: "off" }).reasoningEffort).toBe("off");
    expect(normalizeSettings({ ...base, reasoningEffort: "nonsense" })).toEqual(base);
  });

  it("presetId 非 custom/local/commandcode/glm 时回退为 glm", () => {
    const input = {
      presetId: "weird",
      provider: { baseURL: "https://x", apiKey: "k", model: "m" },
    };
    expect(normalizeSettings(input).presetId).toBe("glm");
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
