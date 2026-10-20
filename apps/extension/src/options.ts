/**
 * Options 设置页逻辑：GLM 预设 / 自定义 Provider 表单，chrome.storage 持久化。
 */
import { loadSettings, saveSettings } from "./storage.js";
import { GLM_PRESET, DEFAULT_SETTINGS, type StoredSettings } from "./types.js";

const baseURLInput = document.getElementById("baseURL") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const modelInput = document.getElementById("model") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const presetRadios = document.querySelectorAll<HTMLInputElement>('input[name="preset"]');

function getSelectedPreset(): StoredSettings["presetId"] {
  const checked = document.querySelector<HTMLInputElement>('input[name="preset"]:checked');
  return checked?.value === "custom" ? "custom" : "glm";
}

function setSelectedPreset(presetId: StoredSettings["presetId"]): void {
  presetRadios.forEach((radio) => {
    radio.checked = radio.value === presetId;
  });
}

function applyPresetDefaults(presetId: StoredSettings["presetId"]): void {
  if (presetId === "glm") {
    baseURLInput.value = GLM_PRESET.baseURL;
    modelInput.value = GLM_PRESET.model;
  }
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSelectedPreset(settings.presetId);
  baseURLInput.value = settings.provider.baseURL || GLM_PRESET.baseURL;
  apiKeyInput.value = settings.provider.apiKey;
  modelInput.value = settings.provider.model || GLM_PRESET.model;
}

presetRadios.forEach((radio) => {
  radio.addEventListener("change", () => {
    applyPresetDefaults(getSelectedPreset());
  });
});

saveButton.addEventListener("click", () => {
  void handleSave();
});

async function handleSave(): Promise<void> {
  const presetId = getSelectedPreset();
  const baseURL = baseURLInput.value.trim() || DEFAULT_SETTINGS.provider.baseURL;
  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_SETTINGS.provider.model;

  if (!apiKey) {
    statusEl.textContent = "请填写 API Key";
    return;
  }

  await saveSettings({ presetId, provider: { baseURL, apiKey, model } });

  if (presetId === "custom") {
    try {
      const origin = new URL(baseURL).origin + "/*";
      chrome.runtime.sendMessage({ type: "REQUEST_HOST_PERMISSION", origin });
    } catch {
      // baseURL 不是合法 URL 时跳过权限申请，保存本身仍然成功
    }
  }

  statusEl.textContent = "已保存";
}

void init();
