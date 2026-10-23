/**
 * Options 设置页逻辑。
 *
 * 两个分支：official（选模型即可）与 custom（全部自己填）。
 *
 * 一条贯穿本文件的原则：**用户显式选过的东西必须活下来。**
 * 之前这里出过 bug——保存时把用户选的模型写进存储了，但重新打开设置页时
 * normalizeSettings 用预设值覆盖了它，表现为「改了模型但保存不了」。
 * 现在的分工是：端点由模式决定，模型和 Key 尊重用户。
 */
import { loadSettings, saveSettings } from "./storage.js";
import {
  DEFAULT_OFFICIAL_MODEL,
  OFFICIAL_BASE_URL,
  OFFICIAL_MODELS,
  isOfficialModel,
  type StoredSettings,
  type HighlightStyle,
} from "./types.js";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="mode"]');
const officialPane = $<HTMLDivElement>("officialPane");
const customPane = $<HTMLDivElement>("customPane");
const modelList = $<HTMLDivElement>("modelList");
const customBaseURLInput = $<HTMLInputElement>("customBaseURL");
const customApiKeyInput = $<HTMLInputElement>("customApiKey");
const customModelInput = $<HTMLInputElement>("customModel");
const showBubbleCheckbox = $<HTMLInputElement>("showBubbleTrigger");
const statusEl = $<HTMLDivElement>("status");
const bannerEl = $<HTMLDivElement>("banner");
const bannerText = $<HTMLSpanElement>("bannerText");
const saveButton = $<HTMLButtonElement>("save");
const testButton = $<HTMLButtonElement>("test");
const hotkeyEl = $<HTMLElement>("hotkey");

type Mode = StoredSettings["mode"];

function currentMode(): Mode {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked');
  return checked?.value === "custom" ? "custom" : "official";
}

function setMode(mode: Mode): void {
  modeRadios.forEach((r) => {
    r.checked = r.value === mode;
  });
  officialPane.classList.toggle("hidden", mode !== "official");
  customPane.classList.toggle("hidden", mode !== "custom");
  setStatus("", "");
  hideBanner();
}

/** 渲染模型单选项。用卡片而不是 <select>：模型说明对用户有决策价值。 */
function renderModels(selected: string): void {
  modelList.replaceChildren();

  const chosen = isOfficialModel(selected) ? selected : DEFAULT_OFFICIAL_MODEL;

  for (const model of OFFICIAL_MODELS) {
    const label = document.createElement("label");
    label.className = "model";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "model";
    input.value = model.id;
    input.checked = model.id === chosen;

    const dot = document.createElement("span");
    dot.className = "dot";

    const body = document.createElement("span");
    body.className = "body";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = model.label;
    if (model.id === DEFAULT_OFFICIAL_MODEL) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "默认";
      name.appendChild(badge);
    }

    const note = document.createElement("span");
    note.className = "note";
    note.textContent = model.note;

    body.append(name, note);
    label.append(input, dot, body);
    modelList.appendChild(label);
  }
}

function selectedModel(): string {
  const checked = document.querySelector<HTMLInputElement>('input[name="model"]:checked');
  return checked?.value ?? DEFAULT_OFFICIAL_MODEL;
}

function setStatus(text: string, kind: "" | "ok" | "warn" | "err"): void {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function showBanner(text: string, kind: "warn" | "err" | "ok"): void {
  bannerText.textContent = text;
  bannerEl.className = `banner ${kind}`;
}

function hideBanner(): void {
  bannerEl.className = "banner err hidden";
}

/** 根据平台显示快捷键（mac 显示 ⌥⇧C，其他显示 Alt+Shift+C） */
function renderHotkey(): void {
  const isMac = navigator.platform.toLowerCase().includes("mac");
  hotkeyEl.textContent = isMac ? "⌥⇧C" : "Alt+Shift+C";
}

async function init(): Promise<void> {
  renderHotkey();

  const settings = await loadSettings();
  setMode(settings.mode);

  if (showBubbleCheckbox) {
    showBubbleCheckbox.checked = settings.showBubbleTrigger ?? true;
  }

  const highlightStyleRadios = document.querySelectorAll<HTMLInputElement>('input[name="highlightStyle"]');
  highlightStyleRadios.forEach((r) => {
    r.checked = r.value === (settings.highlightStyle ?? "highlighter");
  });

  renderModels(settings.provider.model);

  if (settings.mode === "custom") {
    customBaseURLInput.value = settings.provider.baseURL;
    customApiKeyInput.value = settings.provider.apiKey;
    customModelInput.value = settings.provider.model;
  }
}

function collectSettings(): StoredSettings {
  const mode = currentMode();
  const showBubbleTrigger = showBubbleCheckbox ? showBubbleCheckbox.checked : true;
  const checkedStyle = document.querySelector<HTMLInputElement>('input[name="highlightStyle"]:checked');
  const highlightStyle = (checkedStyle?.value as HighlightStyle) ?? "highlighter";

  if (mode === "official") {
    return {
      mode,
      provider: {
        // 官方端点固定，不让用户为了改模型而误改地址
        baseURL: OFFICIAL_BASE_URL,
        // 官方 Key 由构建注入到 background，设置里不存、页面上不显示
        apiKey: "",
        // 尊重用户选的模型（这是之前保存不上的那个 bug）
        model: selectedModel(),
      },
      showBubbleTrigger,
      highlightStyle,
    };
  }

  return {
    mode,
    provider: {
      baseURL: customBaseURLInput.value.trim(),
      apiKey: customApiKeyInput.value.trim(),
      model: customModelInput.value.trim(),
    },
    showBubbleTrigger,
    highlightStyle,
  };
}

/** 校验并返回错误信息，通过则返回 null */
function validate(settings: StoredSettings): string | null {
  const { baseURL, apiKey, model } = settings.provider;

  // 官方模式的 Key 由构建注入，不校验
  if (settings.mode === "custom" && !apiKey) return "请填写 API Key";
  if (!baseURL) return "请填写 API 地址";
  if (!model) return "请选择或填写模型";

  if (settings.mode === "custom") {
    try {
      new URL(baseURL);
    } catch {
      return "API 地址不是合法 URL，应形如 https://api.example.com/v1";
    }
  }
  return null;
}

modeRadios.forEach((radio) => {
  radio.addEventListener("change", () => setMode(currentMode()));
});

$<HTMLButtonElement>("toggleCustomKey").addEventListener("click", () => {
  togglePassword(customApiKeyInput, $<HTMLButtonElement>("toggleCustomKey"));
});

function togglePassword(input: HTMLInputElement, button: HTMLButtonElement): void {
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  button.textContent = showing ? "显示" : "隐藏";
}

saveButton.addEventListener("click", () => void handleSave());

async function handleSave(): Promise<void> {
  const settings = collectSettings();
  const error = validate(settings);
  if (error) {
    setStatus(error, "err");
    return;
  }

  await saveSettings(settings);

  // 自定义域名需要运行时申请权限；官方端点已在 manifest 声明过
  if (settings.mode === "custom") {
    try {
      const origin = new URL(settings.provider.baseURL).origin + "/*";
      chrome.runtime.sendMessage({ type: "REQUEST_HOST_PERMISSION", origin });
    } catch {
      // URL 非法时跳过权限申请；validate 已经拦过这种情况
    }
  }

  setStatus("已保存", "ok");
  hideBanner();
}

testButton.addEventListener("click", () => void handleTest());

/**
 * 连通性测试：打一次最小的 /chat/completions。
 *
 * 值得单独做一个按钮，因为配置错误默认会表现为「切分时弹出 401」，
 * 那时用户已经离开设置页，也不确定是 Key 错还是地址错。
 */
async function handleTest(): Promise<void> {
  const settings = collectSettings();
  const error = validate(settings);
  if (error) {
    setStatus(error, "err");
    return;
  }

  testButton.disabled = true;
  saveButton.disabled = true;
  setStatus("测试中…", "");
  hideBanner();

  try {
    const res = await new Promise<{ ok: boolean; elapsed?: number; error?: string }>(
      (resolve) => {
        chrome.runtime.sendMessage(
          { type: "TEST_CONNECTION", settings },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({
                ok: false,
                error: `后台连接失败：${chrome.runtime.lastError.message}`,
              });
            } else {
              resolve(response || { ok: false, error: "未收到响应" });
            }
          }
        );
      }
    );

    if (res.ok) {
      setStatus(`连接正常（${res.elapsed ?? 0}ms）`, "ok");
      return;
    }

    const detail = res.error || "请求失败";
    setStatus(detail, "err");
    showBanner(detail, "err");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const detail = `无法连接：${message}`;
    setStatus(detail, "err");
    showBanner(detail, "err");
  } finally {
    testButton.disabled = false;
    saveButton.disabled = false;
  }
}

void init();
