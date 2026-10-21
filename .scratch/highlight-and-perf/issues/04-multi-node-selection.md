# 04 — 跨段落 / 多行选区支持

Status: done
Blocked by: 01-preserve-text-nodes.md

## 要交付的行为

用户选中跨越多个段落（多个文本节点）的英文时，切分与高亮仍然正确，不静默失败。

当前 `content.ts` 只取 `selection.getRangeAt(0)` 且 `applyHighlight` 假设单个文本节点，跨节点选区会丢失或错乱。

## 验收

- 选区跨 ≥2 个 `<p>` 时，所有文本都被切分并高亮，无字符丢失。
- 拼回原选区 `textContent` 逐字符一致。
- 不破坏中间的块级元素结构（段落仍是段落）。
