# 02 — 撤销高亮（用户可还原页面）

Status: done
Blocked by: 01-preserve-text-nodes.md

## 要交付的行为

用户能一键清除当前页面上的所有 Chunkly 高亮，页面回到切分前的样子。快捷键与设置/右键菜单都能触发。

## 验收

- 移除所有 `.chunkly-chunk` span 后 `normalize()`，`textContent` 与原文字面量一致。
- 无残留样式节点导致页面显示异常（`<style>` 保留无害，但 span 必须全清）。
- 对同一段文本再次切分不会叠加出嵌套 span。
