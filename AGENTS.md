# Agent 约定

本文件给在本 repo 里工作的 agent 看。核心约定不在压缩时丢失。

## 必读

- `GLOSSARY.md` — 领域词汇。测试名、ticket 标题、注释都用这里的措辞。
- `CODING_STANDARDS.md` — 编码标准，`/code-review` 的 Standards 轴来源。
- `docs/agents/issue-tracker.md` — issue 存放位置。
- `docs/adr/` — 已做出的、不容易反悔的决定。改到相关区域先读。
- `docs/优化清单.md` — 优化方向与优先级。
- `docs/市场调研.md` — 市场结论（不要重复调研已有结论）。

## 当前状态（供快速定位）

- `packages/engine` — 切分能力层。零运行时依赖。`chunk()` 是唯一对外入口。
  - `segment.ts` 负责长文本按句切段 + 结果拼回。改动这里务必跑 `segment.test.ts`，它守着"无损"契约。
- `apps/extension` — MV3 插件。请求在 `background.ts`，DOМ 操作在 `highlight.ts`。

## 硬约束

1. **无损**：所有 chunk 拼接必须逐字符等于原文。`segment.ts` 与 `parse.ts` 的测试守着这条。
2. **不销毁原始 DOM 文本节点**（ADR-0001）。高亮必须是可撤销的。
3. **密钥不进 content script**（ADR-0002）。
4. **engine 保持零运行时依赖**。

## 命令

```bash
pnpm test                                      # 全部测试
pnpm --filter @chunkly/engine test             # 只测 engine
pnpm --filter @chunkly/extension lint          # 类型检查
pnpm --filter @chunkly/extension build         # 产出 dist/
```
