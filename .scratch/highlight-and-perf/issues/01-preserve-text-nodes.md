# 01 — applyHighlight 保留原始 DOM 文本节点

Status: done
Blocked by: None

## 要交付的行为

用户在网页上切分文本后，高亮层可以**无损撤销**：原始文本节点仍存在于 DOM 中，移除 span 并 `normalize()` 后，`textContent` 与高亮前逐字符一致。

宿主页面持有的旧节点引用不应失效（ADR-0001）。

## 为什么

当前 `range.deleteContents()` 销毁原始节点 → 无法撤销、破坏 React/Vue 受控渲染、影响 contenteditable。已在 jsdom 中复现（`isConnected === false`）。

## 验收

- 测试断言：高亮后原始 `Text` 节点仍 `isConnected`，且 `textContent` 未被清空。
- 测试断言：撤销后父节点 `textContent` 与原文字面量完全一致。
- 跨多个文本节点（`<p>a</p><p>b</p>` 式选区）也能正确包裹。
- 现有 `computeSegments` 的 4 个测试不变仍通过。
