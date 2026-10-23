import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { initPopup } from "../src/popup.js";
import { DEFAULT_SETTINGS, OFFICIAL_MODELS } from "../src/types.js";
import type { StoredSettings } from "../src/types.js";

describe("Popup 控制面板 DOM 逻辑", () => {
  let mockSettings: StoredSettings;

  beforeEach(() => {
    mockSettings = { ...DEFAULT_SETTINGS, showBubbleTrigger: true };

    document.body.innerHTML = `
      <input type="checkbox" id="toggle-bubble" />
      <select id="select-style">
        <option value="highlighter">荧光笔</option>
        <option value="underline">下划线</option>
      </select>
      <span id="model-mode-desc"></span>
      <select id="select-model"></select>
      <button id="btn-open-options" type="button"></button>
      <span id="save-hint"></span>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("正确初始化设置状态与模型列表", async () => {
    const saveSettingsSpy = vi.fn().mockResolvedValue(undefined);
    const openOptionsSpy = vi.fn();

    await initPopup({
      loadSettings: async () => mockSettings,
      saveSettings: saveSettingsSpy,
      openOptionsPage: openOptionsSpy,
    });

    const toggle = document.getElementById("toggle-bubble") as HTMLInputElement;
    const select = document.getElementById("select-model") as HTMLSelectElement;

    expect(toggle.checked).toBe(true);
    // 官方模式下的选项数量应等于 OFFICIAL_MODELS
    expect(select.options.length).toBe(OFFICIAL_MODELS.length);
    expect(select.value).toBe(mockSettings.provider.model);

    const styleSelect = document.getElementById("select-style") as HTMLSelectElement;
    expect(styleSelect.value).toBe("highlighter");
  });

  it("切换高亮视觉风格时自动触发 saveSettings", async () => {
    const saveSettingsSpy = vi.fn().mockResolvedValue(undefined);

    await initPopup({
      loadSettings: async () => mockSettings,
      saveSettings: saveSettingsSpy,
      openOptionsPage: vi.fn(),
    });

    const styleSelect = document.getElementById("select-style") as HTMLSelectElement;
    styleSelect.value = "underline";
    styleSelect.dispatchEvent(new Event("change"));

    expect(saveSettingsSpy).toHaveBeenCalledTimes(1);
    expect(saveSettingsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        highlightStyle: "underline",
      }),
    );
  });

  it("切换气泡开关时自动触发 saveSettings", async () => {
    const saveSettingsSpy = vi.fn().mockResolvedValue(undefined);

    await initPopup({
      loadSettings: async () => mockSettings,
      saveSettings: saveSettingsSpy,
      openOptionsPage: vi.fn(),
    });

    const toggle = document.getElementById("toggle-bubble") as HTMLInputElement;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(saveSettingsSpy).toHaveBeenCalledTimes(1);
    expect(saveSettingsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        showBubbleTrigger: false,
      }),
    );
  });

  it("切换模型时自动触发 saveSettings", async () => {
    const saveSettingsSpy = vi.fn().mockResolvedValue(undefined);

    await initPopup({
      loadSettings: async () => mockSettings,
      saveSettings: saveSettingsSpy,
      openOptionsPage: vi.fn(),
    });

    const select = document.getElementById("select-model") as HTMLSelectElement;
    select.value = "z-ai/glm-5.3-flash";
    select.dispatchEvent(new Event("change"));

    expect(saveSettingsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.objectContaining({
          model: "z-ai/glm-5.3-flash",
        }),
      }),
    );
  });

  it("点击打开设置按钮时调用 openOptionsPage", async () => {
    const openOptionsSpy = vi.fn();

    await initPopup({
      loadSettings: async () => mockSettings,
      saveSettings: vi.fn(),
      openOptionsPage: openOptionsSpy,
    });

    const btn = document.getElementById("btn-open-options") as HTMLButtonElement;
    btn.click();

    expect(openOptionsSpy).toHaveBeenCalledTimes(1);
  });
});
