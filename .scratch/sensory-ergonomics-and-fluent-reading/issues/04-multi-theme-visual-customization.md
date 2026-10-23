# 04 — 多模态高亮视觉风格切换与经典荧光笔还原 (Multi-Theme Visual Customization)

**What to build:**
提供 4 种视觉高亮风格供用户自主切换，同时将默认风格恢复为用户喜爱的经典莫兰迪实体荧光笔，并修复荧光笔下的鼠标选区叠加混色。在 Popup 快捷面板与 Options 设置页均提供风格选择器与实时预览，通过 `chrome.storage.onChanged` 实现全网页响应式即时换肤，无需刷新页面。

**Blocked by:** 01-visual-ergonomics-and-selection-fix.md

**Status:** done

## Acceptance Criteria
- [x] 恢复原有经典实体荧光笔（`highlighter`）为默认风格，且同时保留鼠标划选穿透修复（`.chunkly-chunk::selection` 高对比度覆盖）。
- [x] 提供 4 种可选项：
  1. `highlighter`: 经典莫兰迪实体荧光笔（默认）
  2. `underline`: 极简清晰下划线（3px 彩色实线下划线，清晰可见）
  3. `tint`: 柔和呼吸微底色（半透明低饱和护眼）
  4. `spacing`: SLA 意群微字距线索（出版级纯文字 + 微间距 + 竖线线索）
- [x] `storage.ts` 规范化校验 `highlightStyle` 偏好，非法值安全回退默认。
- [x] Popup 面板支持快捷下拉切换，选择即生效并自动持久化。
- [x] Options 设置页提供图文单选卡片与 4 种风格的真实渲染实时预览（Live Preview）。
- [x] `content.ts` 监听存储变更，通过 `:root[data-chunkly-style="..."]` 实现跨标签页免刷新实时换肤。
- [x] 全套测试（158 / 158）全部通过，类型检查 0 错误，打包正常。
