/**
 * Options 设置页逻辑。
 *
 * 设计上有一个明确的教训驱动：
 * 旧版把默认预设设成 GLM，用户粘上 CommandCode 的 key 后存下的是智谱地址，
 * 401 却被提示成「API Key 无效」——**key 是对的，报错误导**。
 * 所以这一版做三件事：
 *   1. 默认预设就是唯一开箱可用的那个（CommandCode），不做无意义的选择；
 *   2. 加了「测试连接」，配置错误在设置页当场发现，而不是等切分时才 401；
 *   3. 错误提示指向真正要检查的东西（地址与 key 是否同一家）。
 */
import { loadSettings, saveSettings } from "./storage.js";
import { COMMANDCODE_PRESET, DEFAULT_SETTINGS, PRESETS, type StoredSettings } from "./types.js";

type PresetId = StoredSettings["presetId"];

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const baseURLInput = $<HTMLInputElement>("baseURL");
const apiKeyInput = $<HTMLInputElement>("apiKey");
const modelInput = $<HTMLInputElement>("model");
const effortSelect = $<HTMLSelectElement>("reasoningEffort");
const keyHelp = $<HTMLParagraphElement>("keyHelp");
const statusEl = $<HTMLDivElement>("status");
const saveButton = $<HTMLButtonElement>("save");
const testButton = $<HTMLButtonElement>("test");
const toggleKeyButton = $<HTMLButtonElement>("toggleKey");
const radios = document.querySelectorAll<HTMLInputElement>('input[name="preset"]');

/** 各预设推荐的推理强度：只对确认支持 off 的服务传值。 */
const PRESET_EFFORT: Record<PresetId, string> = {
  commandcode: "off",
  local: "off",
  custom: "",
};

const KEY_HELP: Record<PresetId, string> = {
  commandcode: "在 CommandCode 计划里生成的 key，以 <code>user_</code> 开头。",
  local: "本机网关通常不校验 key，随便填即可（如 magpie）。",
  custom: "填该服务商签发的 key。",
};

function getSelectedPreset(): PresetId {
  const checked = document.querySelector<HTMLInputElement>('input[name="preset"]:checked');
  const value = checked?.value;
  return value === "local" || value === "custom" ? value : "commandcode";
}

function setSelectedPreset(presetId: PresetId): void {
  radios.forEach((radio) => {
    radio.checked = radio.value === presetId;
  });
}

/** 切换预设时把地址/模型/推理强度换成该预设的默认值（apiKey 保留，用户不必重填）。 */
function applyPresetDefaults(presetId: PresetId): void {
  if (presetId !== "custom") {
    const preset = PRESETS[presetId];
    baseURLInput.value = preset.baseURL;
    modelInput.value = preset.model;
  }
  effortSelect.value = PRESET_EFFORT[presetId];
  keyHelp.innerHTML = KEY_HELP[presetId];
  setStatus("", "");
}

function setStatus(text: string, kind: "" | "ok" | "warn" | "err"): void {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

async function init(): Promise<void> {
  const settings = await loadSettings();
  setSelectedPreset(settings.presetId);
  baseURLInput.value =
    settings.provider.baseURL || PRESETS[settings.presetId as keyof typeof PRESETS]?.baseURL || "";
  modelInput.value =
    settings.provider.model || PRESETS[settings.presetId as keyof typeof PRESETS]?.model || "";
  apiKeyInput.value = settings.provider.apiKey;
  effortSelect.value = settings.reasoningEffort ?? DEFAULT_SETTINGS.reasoningEffort ?? "";
  keyHelp.innerHTML = KEY_HELP[settings.presetId];

  // 首次使用（没有 key）时把焦点放到 key 上，省一步点击
  if (!settings.provider.apiKey) apiKeyInput.focus();
}

function collectSettings(): StoredSettings {
  const presetId = getSelectedPreset();
  const effortRaw = effortSelect.value;
  const reasoningEffort =
    effortRaw === "off" || effortRaw === "low" || effortRaw === "medium" || effortRaw === "high"
      ? effortRaw
      : undefined;

  return {
    presetId,
    provider: {
      baseURL: baseURLInput.value.trim(),
      apiKey: apiKeyInput.value.trim(),
      model: modelInput.value.trim(),
    },
    ...(reasoningEffort ? { reasoningEffort } : {}),
  };
}

radios.forEach((radio) => {
  radio.addEventListener("change", () => applyPresetDefaults(getSelectedPreset()));
});

toggleKeyButton.addEventListener("click", () => {
  const showing = apiKeyInput.type === "text";
  apiKeyInput.type = showing ? "password" : "text";
  toggleKeyButton.textContent = showing ? "显示" : "隐藏";
});

saveButton.addEventListener("click", () => void handleSave());

async function handleSave(): Promise<void> {
  const settings = collectSettings();

  if (!settings.provider.apiKey) {
    setStatus("请先填写 API Key", "err");
    apiKeyInput.focus();
    return;
  }
  if (!settings.provider.baseURL || !settings.provider.model) {
    setStatus("API 地址和模型不能为空", "err");
    return;
  }

  await saveSettings(settings);

  // 任意自定义域名需要运行时申请权限；内置预设已在 manifest 声明过
  if (settings.presetId === "custom") {
    try {
      const origin = new URL(settings.provider.baseURL).origin + "/*";
      chrome.runtime.sendMessage({ type: "REQUEST_HOST_PERMISSION", origin });
    } catch {
      // baseURL 不是合法 URL 时跳过权限申请，保存本身仍然成功
    }
  }

  setStatus("已保存", "ok");
}

/**
 * 连通性测试：直接打一次最小的 /chat/completions。
 *
 * 为什么值得专门做一个按钮：配置错误的默认表现是「切分时弹出 401」，
 * 而那时用户已经离开设置页、也不确定是 key 错还是地址错。
 * 在这里当场测出结果，错误信息能直接指向原因。
 */
testButton.addEventListener("click", () => void handleTest());

async function handleTest(): Promise<void> {
  const settings = collectSettings();

  if (!settings.provider.apiKey) {
    setStatus("请先填写 API Key", "err");
    return;
  }

  testButton.disabled = true;
  saveButton.disabled = true;
  setStatus("测试中…", "");

  const startedAt = Date.now();
  try {
    const body: Record<string, unknown> = {
      model: settings.provider.model,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1,
      temperature: 0,
    };
    if (settings.reasoningEffort) body.reasoning_effort = settings.reasoningEffort;

    const response = await fetch(
      settings.provider.baseURL.replace(/\/+$/, "") + "/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.provider.apiKey}`,
        },
        body: JSON.stringify(body),
      }
    );

    const elapsed = Date.now() - startedAt;
    const text = await response.text().catch(() => "");

    if (response.ok) {
      setStatus(`连接正常（${elapsed}ms）`, "ok");
      return;
    }

    setStatus(describeFailure(response.status, text, settings.provider.baseURL), "err");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`无法连接：${message}`, "err");
  } finally {
    testButton.disabled = false;
    saveButton.disabled = false;
  }
}

/**
 * 把 HTTP 失败翻译成「用户该去改什么」。
 *
 * 关键是 401/403：它**通常不是 key 本身无效**，而是 key 与地址不属于同一服务。
 * 直接说「Key 无效」会把用户引向错误的排查方向（我本人就被这条提示误导过）。
 */
function describeFailure(status: number, bodyText: string, baseURL: string): string {
  const snippet = bodyText.slice(0, 160).replace(/\s+/g, " ").trim();
  const host = safeHost(baseURL);

  if (status === 401 || status === 403) {
    return `鉴权失败（${status}）。请确认这个 Key 属于 ${host} —— Key 与地址必须来自同一家服务。${snippet ? " 详情：" + snippet : ""}`;
  }
  if (status === 404) {
    return `地址不存在（404）。检查 API 地址是否漏了路径，例如应形如 …/provider/v1。${snippet ? " 详情：" + snippet : ""}`;
  }
  if (status === 429) {
    return `触发限流（429）。稍后再试，或换一个服务。${snippet ? " 详情：" + snippet : ""}`;
  }
  if (status >= 500) {
    return `服务端错误（${status}）。不是你的配置问题，稍后重试。${snippet ? " 详情：" + snippet : ""}`;
  }
  return `请求失败（${status}）。${snippet}`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "该地址";
  }
}

void init();
