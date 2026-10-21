# ADR-0001：高亮渲染必须保留原始 DOM 文本节点

- 状态：已接受
- 日期：2026-10-20

## 背景

`applyHighlight` 最早的实现是：

```ts
range.deleteContents();
range.insertNode(fragment);
```

`deleteContents()` 会**销毁**选区内的原始文本节点，并用新造的 `<span>` + 文本节点替代。实测（jsdom）确认：调用后原始 text node 的 `isConnected === false`，`textContent` 被清空。

## 问题

这个做法有三个后果：

1. **无法撤销。** 原始节点已不存在，用户想还原只能刷新页面。
2. **破坏宿主页面的 DOM 结构。** React / Vue 等受控渲染框架持有对旧节点的引用；节点被替换后，框架的 diff 会与真实 DOM 不一致，可能导致内容错乱或事件失效。
3. **`contenteditable` 与 Shadow DOM 场景会出问题。**

对一个"阅读辅助"工具来说，第 2 条尤其严重：用户是在**别人的页面**上使用它。任何破坏宿主 DOM 的行为都是不可接受的副作用。

## 决策

`applyHighlight` **不得删除原始文本节点**。改为：

1. 把选区覆盖的每个文本节点按 chunk 边界 `splitText()` 切开；
2. 用 `span` **包裹**目标片段（`replaceWith` / `surroundContents`），文本节点本身仍留在 DOM 里；
3. 撤销 = 移除所有 `.chunkly-chunk` span，然后对父节点 `normalize()`。

## 后果

- 得失衡：实现比"删了重建"复杂，需要处理跨节点的选区。
- 换来：可撤销、不破坏宿主 DOM、兼容受控渲染框架。
- 这条约束由 `applyHighlight` 的测试守住（断言原始节点 `isConnected` 且内容不变，且撤销后 `textContent` 与原文一致）。

## 备选方案（已否决）

- **保持 deleteContents + 记录原文以便整段重写。** 否决：整段重写同样会破坏宿主节点的身份，React 场景还是会出问题。
- **用 CSS 背景色 + 绝对定位的覆盖层。** 否决：无法精确对齐任意折行文本，且需要跟随滚动/resize。
