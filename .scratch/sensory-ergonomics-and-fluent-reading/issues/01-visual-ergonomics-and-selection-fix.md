# 01 — 视觉人体工学重构与选区穿透修复 (Visual Ergonomics & Selection Fix)

**What to build:** 
彻底消除高饱和度荧光笔底色的视觉眩光，并修复鼠标划选文本时意群色块与浏览器选区叠加导致的文字模糊发暗问题。让意群以淡雅的点阵虚线下划线和低不透明度（0.10~0.15）微底色呈现，文字颜色完全继承宿主页面原生字体颜色，实现对浅色、深色模式（Dark Mode）与任意网站排版的无缝适配。

**Blocked by:** None (can start immediately)

**Status:** done

## Acceptance Criteria
- [x] `.chunkly-chunk` 与 `::highlight(chunkly-*)` 的文字颜色设置为 `color: inherit`，不再强行写死深色前景，完美自适应深色与浅色页面。
- [x] 意群背景色透明度从 0.88~0.90 下降到 0.10~0.15，并配以同色系的 2px 优雅点阵虚线下划线（Minimal Dot Accent），彻底消除眩光感。
- [x] 显式声明 `.chunkly-chunk::selection` 伪类，确保用户拖选高亮文字时，背景色与前景色主动让位给清晰的选区样式，杜绝混色暗淡。
- [x] 视听激活状态 `.chunkly-chunk-active` 与 `::highlight(chunkly-active)` 保持高对比度焦点提示（温润高亮 + 醒目下划线指示条）。
- [x] 所有现有 DOM 高亮和 Highlight API 测试持续通过。
