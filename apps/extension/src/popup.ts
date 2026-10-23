/**
/**
 * Popup 控制面板核心逻辑。
 *
 * 遵循 Matt Pocock / 函数式与副作用分离规范：
 * - 依赖项由 context 注入，便于 JSDOM 单测；
 * - 自动保存用户操作，微动效提示反馈；
 * - 极简聚焦：划词气泡开关与模型快速切换。
 */
import { loadSettings, saveSettings } from "./storage.js";
import { OFFICIAL_MODELS, type StoredSettings, type HighlightStyle } from "./types.js";

export interface PopupContext {
  loadSettings: () => Promise<StoredSettings>;
  saveSettings: (settings: StoredSettings) => Promise<void>;
  openOptionsPage: () => void;
}

const defaultContext: PopupContext = {
  loadSettings,
  saveSettings,
  openOptionsPage: () => {
    chrome.runtime.openOptionsPage();
  },
};

export async function initPopup(ctx: PopupContext = defaultContext): Promise<void> {
  const toggleBubble = document.getElementById("toggle-bubble") as HTMLInputElement | null;
  const selectStyle = document.getElementById("select-style") as HTMLSelectElement | null;
  const modelModeDesc = document.getElementById("model-mode-desc");
  const selectModel = document.getElementById("select-model") as HTMLSelectElement | null;
  const btnOpenOptions = document.getElementById("btn-open-options");
  const saveHint = document.getElementById("save-hint");

  let currentSettings: StoredSettings;
  try {
    currentSettings = await ctx.loadSettings();
  } catch {
    return;
  }

  function showSaveHint(): void {
    if (!saveHint) return;
    saveHint.classList.add("visible");
    setTimeout(() => {
      saveHint.classList.remove("visible");
    }, 1500);
  }

  // 1. 划词悬浮开关
  if (toggleBubble) {
    toggleBubble.checked = currentSettings.showBubbleTrigger ?? true;
    toggleBubble.addEventListener("change", async () => {
      currentSettings.showBubbleTrigger = toggleBubble.checked;
      await ctx.saveSettings(currentSettings);
      showSaveHint();
    });
  }

  // 2. 视觉风格选择
  if (selectStyle) {
    selectStyle.value = currentSettings.highlightStyle ?? "highlighter";
    selectStyle.addEventListener("change", async () => {
      currentSettings.highlightStyle = selectStyle.value as HighlightStyle;
      await ctx.saveSettings(currentSettings);
      showSaveHint();
    });
  }

  // 3. 切分模型选择
  if (selectModel) {
    selectModel.innerHTML = "";
    if (currentSettings.mode === "official") {
      if (modelModeDesc) modelModeDesc.textContent = "官方直连端点";
      for (const m of OFFICIAL_MODELS) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.label} (${m.note})`;
        if (m.id === currentSettings.provider.model) {
          opt.selected = true;
        }
        selectModel.appendChild(opt);
      }

      selectModel.addEventListener("change", async () => {
        currentSettings.provider.model = selectModel.value;
        await ctx.saveSettings(currentSettings);
        showSaveHint();
      });
    } else {
      if (modelModeDesc) modelModeDesc.textContent = "自定义 Provider";
      const opt = document.createElement("option");
      opt.value = currentSettings.provider.model;
      opt.textContent = `${currentSettings.provider.model} (自定义)`;
      opt.selected = true;
      selectModel.appendChild(opt);
      selectModel.disabled = true;
    }
  }

  // 3. 打开详细设置页
  if (btnOpenOptions) {
    btnOpenOptions.addEventListener("click", () => {
      ctx.openOptionsPage();
    });
  }
}

// 浏览器环境中自动运行
if (typeof document !== "undefined" && document.getElementById("toggle-bubble")) {
  void initPopup();
}
