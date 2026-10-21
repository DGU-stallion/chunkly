# 领域词汇表（GLOSSARY）

本项目的领域概念。新代码、测试名、ticket 标题都应使用这里的措辞。

## 核心概念

**意群（chunk）**
一组共同构成一个语义单元的英文词。本项目要切分的目标。不是"词组"（phrase）的同义词——意群按**口语停顿/呼吸点**划分，不严格按语法结构。
_Avoid_: 词组、短语块、segment（segment 在本项目另有含义）

**chunk 边界（chunk boundary）**
两个相邻意群之间的切点。永远落在原文字符之间，不消耗字符。

**segment（分段）**
为**并发请求**把长文本切成的片段。与 chunk 是不同层级的概念：

- segment 是**请求单位**，只按句末标点切（句末永远是合法的 chunk 边界，所以切 segment 不会切开 chunk）。
- chunk 是**输出单位**，是给读者看的意群。

_Avoid_: 用 "segment" 指意群。

**offset 对齐（offset alignment）**
把 LLM 返回的 chunk 文本字符串映射回原文的 `startOffset`/`endOffset`。实现方式是从游标处顺序 `indexOf`，不做模糊匹配。

**无损（lossless）**
一条硬性契约：所有 chunk 按顺序拼接，必须逐字符等于原文。包括空白。测试名里出现 "无损" 即指此契约。

**空隙（gap）**
原文中不属于任何 chunk 的字符区间（通常是 chunk 之间的空白）。渲染时不加高亮色，但必须保留，否则破坏无损契约。

## 架构

**engine**（`packages/engine`）
意群切分能力。纯 TS，无浏览器或 DOM 依赖。对外只暴露 `chunk(text, options)`。

**extension**（`apps/extension`）
MV3 浏览器插件。负责 DOM 提取、渲染、设置页。不含切分逻辑。

**provider**
一个 OpenAI 兼容的 LLM 端点配置：`{ baseURL, apiKey, model }`。

**preset（预设）**
设置页里的 provider 快捷选项：`commandcode` | `glm` | `local` | `custom`。

**reasoningEffort**
透传给 provider 的 `reasoning_effort`。`"off"` 关闭 thinking，实测延迟减半且质量不变。注意各 provider 取值不同，GLM 不接受 `off`。

## 渲染

**applyHighlight**
在真实 DOM 上把 chunk 渲染为高亮 `<span>`。必须保留原始文本节点，以便撤销。
_Avoid_: 说"替换选中内容"——替换是不可撤销的，见 ADR-0001。

**撤销（undo）**
移除所有 `chunkly-chunk` span 并把父节点 `normalize()`，使 DOM 文本节点回到高亮前的状态。
