# Chunkly Privacy Policy / 隐私政策

**Last Updated / 最近更新日期**: October 23, 2026

## English Version

### 1. Overview
Chunkly ("we", "our", or "the extension") is a browser extension designed to enhance English reading and pronunciation fluency through thought-group chunking, visual focus styling, and synchronized acoustic phrase playback. We respect your privacy and are committed to protecting it.

### 2. Information We Collect and Process
- **Selected Text**: When you explicitly trigger the "Chunk" or "Speak" actions on a webpage, Chunkly captures only the specific text passage you highlighted. This text is processed solely for the purpose of linguistic syntactic boundary segmentation and Text-to-Speech audio generation.
- **User Settings and Preferences**: Chunkly stores your configuration choices (such as preferred visual style, selection bubble display toggle, and custom API keys or model endpoints) locally in your browser using Chrome's `chrome.storage.local` API.

### 3. How We Use and Transmit Data
- **No Personal Data Collection**: We do not collect, log, track, or share your browsing history, cookies, IP addresses, identity, or personal credentials.
- **Third-Party Processing**:
  - When utilizing official or custom LLM endpoints (e.g., DeepSeek, OpenAI-compatible APIs), your selected text is transmitted securely over HTTPS directly to the specified API service to compute thought-group boundaries.
  - When utilizing cloud neural pronunciation, text chunks are sent securely over HTTPS to Google Translate's neural audio service.
- **No Data Retention on Remote Servers**: Chunkly does not maintain external tracking databases, telemetry servers, or user profiling systems.

### 4. Local Storage & Caching
To minimize API consumption and optimize playback performance, segmentation results and temporary audio clips are cached locally within your browser (`chrome.storage.local` and memory LRU cache). You may clear this data at any time via the extension's Options page or by clearing your browser cache.

### 5. Contact
If you have any questions or concerns regarding this Privacy Policy, please open an issue on our GitHub repository.

---

## 中文版

### 1. 概述
Chunkly（“我们”或“本扩展”）是一款旨在通过母语级“意群切分（Thought Groups）”、无眩光视觉聚焦与视听同步伴读跟读来提升英语阅读和发音语感的浏览器扩展。我们高度重视用户的隐私保护。

### 2. 我们收集与处理的信息
- **用户选中文本**：仅在您明确触发“切分（✨ Chunk）”或“朗读（🔊 朗读）”动作时，扩展才会捕获您当前主动划选的英文文本片段。该文本仅用于句法语法边界切分和语音合成。
- **配置与偏好偏好**：扩展会将您的个性化设置（如高亮视觉风格、划词浮动气泡开关、自定义 API 密钥与模型参数）保存在本地浏览器的 `chrome.storage.local` 中。

### 3. 数据使用与第三方传输
- **绝不收集个人信息**：我们不收集、不跟踪、不出售您的浏览历史、页面访问记录、Cookie、IP 地址或个人身份信息。
- **第三方接口调用**：
  - 当使用官方或自定义 LLM 端点时，您选中的文本通过加密 HTTPS 传输给指定的 LLM 接口完成意群计算；
  - 当启用高保真云端朗读时，意群片段通过 HTTPS 发送给 Google Translate 音频接口获取神经网络发音。
- **无远程数据留存**：Chunkly 不部署任何用户行为分析服务、埋点跟踪器或用户画像数据库。

### 4. 本地存储与缓存
为节省用户 API 额度并提升流畅度，意群切分结果与音频会在本地浏览器存储中进行 LRU 缓存。您可随时在“选项设置页”或通过浏览器管理面板清除所有缓存。

### 5. 联系与支持
若对本隐私政策有任何疑问，欢迎在 GitHub 项目主页提交 Issue 联系。
