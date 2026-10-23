# 03 — 视听双模一体化串联与全流程验证 (Dual-mode Player Integration)

**What to build:**
将视觉改良样式（Ticket 01）与连续语流播放器（Ticket 02）深度整合至 `content.ts`，打通浮动播放条控制、卡拉OK模式与影子跟读模式平滑切换、DOM/CSS Custom Highlight 双轨视听同步，完成全链路端到端功能验证与回归测试。

**Blocked by:** 01-visual-ergonomics-and-selection-fix.md, 02-continuous-speech-boundary-sync.md

**Status:** done

## Acceptance Criteria
- [x] 页面划词唤起伴读时，视觉呈现极简点阵下划线与柔和底色，鼠标划选清晰。
- [x] 播放条在连续流与影子跟读切换时，播放状态平滑过渡，无音频重叠或孤儿计时器。
- [x] 跨 DOM 文本节点高亮与 CSS Highlight API 下的激活焦点跟随稳定顺滑。
- [x] 撤销高亮或点击关闭播放条时，音频与激活高亮均被完全清理。
- [x] 全套测试（Engine + Extension）100% 通过，类型检查与构建无任何告警。
