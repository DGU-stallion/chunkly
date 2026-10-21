# 编码标准（CODING_STANDARDS）

本文件是 `/code-review` 的 Standards 轴来源。repo 标准优先于通用 smell baseline。

## 语言与工具

- TypeScript strict。不用 `any`（`(x as any)` 仅限解析外部不可信 JSON 的一处，且要写注释）。
- ESM，`.js` 后缀写 import（`import { x } from "./y.js"`），因为 engine 用 `"type": "module"` + `moduleResolution: node16`。
- 不引入运行时依赖到 `packages/engine`。engine 必须保持零运行时依赖（它是能力层，要能在任何宿主里跑）。

## 注释

- **注释解释「为什么」，不解释「做什么」。** 代码能看出的东西不写注释。
- 任何非显然的取舍、被否掉的做法、实测数据，都写进注释或 ADR。这个项目的价值有一半在「为什么这么做」上。
- 中文注释。术语用 GLOSSARY 的措辞。

## 测试

- 测试在 **seam** 上写：通过公开接口验证行为，不 mock 内部协作者。只有系统边界（`fetch`、`chrome.*`、DOM）可以 mock。
- 测试名是中文陈述句，描述**行为**而非实现。`it("长文本会切成多段，且拼回后逐字符无损")` ✅ / `it("调用了 splitIntoSegments")` ❌。
- 期望值必须来自独立来源（手工算出的字面量），不能重算实现逻辑（tautological test 禁止）。
- 每个测试一个逻辑断言。
- 先红后绿：不为想象中的未来需求预先写测试。

## 错误处理

- engine 的失败一律抛 `ChunkEngineError`（带 `code` / `retryable`），不抛裸 `Error`。
- 只在**可重试**错误上重试（`isRetryable(code)`）。`AUTH_FAILED` / `INVALID_RESPONSE` 重试无意义。
- 插件侧不吞错：给用户可读提示（toast），不用 `alert`（阻塞页面）。

## 安全

- **任何密钥、API Key、token 都不进 content script。** 网络请求和密钥只在 background service worker。理由见 `docs/adr/0002-background-owns-network.md`。
- 不在仓库里提交真实密钥。`.env` 已在 `.gitignore`。
- 日志/文档里出现密钥一律写 `<REDACTED>`。

## 文档

- 实质性设计决策写 ADR（`docs/adr/NNNN-slug.md`），一行式小改动不写。
- 实测数据写进文档时标注**日期**和**条件**（模型、provider、effort），否则不可复现。
- 不写营销语言。不确定的地方写"未验证"。
