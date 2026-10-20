# Chunkly

意群阅读辅助工具：浏览器插件，用 LLM 对网页英文文本做意群（phrase chunk）切分，标注渲染，帮助英语学习者按意群而非逐词阅读。

## 结构

- `packages/engine` — 切分核心引擎（纯逻辑，不含浏览器专属依赖），对外暴露 `chunk(text, options)`
- `apps/extension` — 浏览器插件（MV3），负责 DOM 提取、渲染标注、设置页

详细产品设计见 [docs/意群切分Engine设计方案.md](docs/意群切分Engine设计方案.md)，实际交付的架构说明/安装配置/已知限制见 [docs/交付文档.md](docs/交付文档.md)。

## 开发

```bash
pnpm install
pnpm test    # 运行所有包的测试
pnpm build   # 构建所有包
```
