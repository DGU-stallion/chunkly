/**
 * Options 设置页逻辑：GLM 预设 / 自定义 Provider 表单，chrome.storage 持久化。
 */
import { loadSettings, saveSettings } from "./storage.js";
import {
  GLM_PRESET,
  LOCAL_PRESET,
  COMMANDCODE_PRESET,
  DEFAULT_SETTINGS,
  type StoredSettings,
} from "./types.js";

const reasoningEffortSelect = document.getElementById(
  "reasoningEffort"
) as HTMLSelectElement;

const baseURLInput = document.getElementById("baseURL") as HTMLInputElement;
const apiKeyInput = document.getElementById("apiKey") as HTMLInputElement;
const modelInput = document.getElementById("model") as HTMLInputElement;
const saveButton = document.getElementById("save") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const presetRadios = document.querySelectorAll<HTMLInputElement>('input[name="preset"]');

const PRESET_DEFAULTS: Record<
  StoredSettings["presetId"],
  Pick<StoredSettings["provider"], "baseURL" | "model">
> = {
  commandcode: COMMANDCODE_PRESET,
  glm: GLM_PRESET,
  local: LOCAL_PRESET,
  custom: { baseURL: "", model: "" },
};

/** 各预设推荐的推理强度：GLM 不支持 off，只能不给或给 low。 */
const PRESET_EFFORT: Record<StoredSettings["presetId"], string> = {
  commandcode: "off",
  glm: "",
  local: "off",
  custom: "",
};

function getSelectedPreset(): StoredSettings["presetId"] {
  const checked = document.querySelector<HTMLInputElement>('input[name="preset"]:checked');
  const value = checked?.value;
  if (value === "custom" || value === "local" || value === "commandcode") {
    return value;
  }
  return "glm";
}

function setSelectedPreset(presetId: StoredSettings["presetId"]): void {
  presetRadios.forEach((radio) => {
    radio.checked = radio.value === presetId;
  });
}

function applyPresetDefaults(presetId: StoredSettings["presetId"]): void {
  const defaults = PRESET_DEFAULTS[presetId];
  if (presetId !== "custom") {
    baseURLInput.value = defaults.baseURL;
    modelInput.value = defaults.model;
  }
  reasoningEffortSelect.value = PRESET_EFFORT[presetId];
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSelectedPreset(settings.presetId);
  baseURLInput.value = settings.provider.baseURL || GLM_PRESET.baseURL;
  apiKeyInput.value = settings.provider.apiKey;
  modelInput.value = settings.provider.model || GLM_PRESET.model;
  reasoningEffortSelect.value = settings.reasoningEffort ?? "";
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
  const effortRaw = reasoningEffortSelect.value;
  const reasoningEffort =
    effortRaw === "off" || effortRaw === "low" || effortRaw === "medium" || effortRaw === "high"
      ? effortRaw
      : undefined;

  if (!apiKey) {
    statusEl.textContent = "请填写 API Key";
    return;
  }

  await saveSettings({
    presetId,
    provider: { baseURL, apiKey, model },
    ...(reasoningEffort ? { reasoningEffort } : {}),
  });

  // 本机网关已在 manifest 的 host_permissions 里（127.0.0.1 / localhost），
  // CommandCode 域名也已声明，只有任意自定义域名需要运行时申请权限。
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
