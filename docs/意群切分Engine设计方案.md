# 意群阅读辅助工具 — 产品设计方案

> 状态：草案 v2，待审阅
> 范围调整说明：v1 是纯 engine 技术方案；v2 扩展为完整产品设计，MVP 明确为浏览器插件，engine 是架构中的一层（保证未来可扩展到桌面/移动端），不是方案全部。本版去除本地 LLM（LM Studio）支持，聚焦调用 LLM API，降低 MVP 复杂度。

---

## 1. 产品定位

**做什么**：一个浏览器插件，对网页上的英文文本进行意群（phrase chunk）划分，用颜色或分隔符标注，帮助英语学习者养成意群阅读习惯，而非逐词阅读，从而提升阅读速度和听力理解能力。

**为什么值得做**：市面已有产品（如 TempoLeaf）用本地 NLP 规则（词性标注 + 手写规则）做切分，规则覆盖度有限，长难句、歧义结构、专有名词场景切分效果差。本产品用 LLM 的语境理解能力替代规则引擎，目标是切分质量显著优于现有规则引擎方案。

**MVP 范围**：浏览器插件。后续视效果和用户反馈再决定是否扩展到桌面端/移动端——架构设计要为此留好扩展空间，但不在第一期实现。

## 2. MVP 功能范围

### 2.1 核心功能

- 用户选中网页上的英文文本（或对整个页面/文章内容），触发意群切分
- 插件调用 LLM API，将文本切分为意群，用颜色区块或分隔符在原网页上标注
- 支持基础的切分粒度调整（如偏好更细/更粗的切分单元）

### 2.2 LLM 接入方式

- **默认**：内置智谱 GLM 免费 API（`GLM-4.7-Flash`），用户免配置即可使用
- **可选**：用户填入自己的订阅 API Key（OpenAI / Claude / Gemini 等），切换到自己的账号额度
- 不支持本地模型（LM Studio 等）——本地模型需要用户自己在电脑上跑服务，配置门槛高、且和"浏览器插件随时可用"的产品体验冲突，MVP 阶段不做，后续如有明确需求再评估

### 2.3 明确不做的（Out of Scope，避免 MVP 过度设计）

- 不做本地小模型/本地规则兜底（如果 API 调用失败，直接提示用户，不做静默降级到规则引擎——本身就是想验证 LLM 方案的效果，掺入规则兜底会混淆两者的实际效果对比）
- 不做学习进度追踪、生词本、复习提醒（这些是"训练闭环"产品的功能，不是切分工具本身的功能，MVP 先验证切分能力是否真的比现有方案好用）
- 不做桌面端/移动端实现（架构留口子，不代表这期要做）

## 3. 关键调研结论（事实依据）

### 3.1 GLM 免费 API（默认 Provider）

- 官方文档确认：`base_url = https://open.bigmodel.cn/api/paas/v4/`，**完全兼容 OpenAI SDK**，只需替换 `base_url` 和 `api_key` 即可复用现有 OpenAI 客户端代码
- 认证方式：`Authorization: Bearer <api-key>`，与 OpenAI 一致
- 当前免费文本模型（官方模型概览页确认）：
  - **GLM-4.7-Flash**（主推，200K 上下文 / 128K 输出，支持思考模式、流式、Function Call、结构化输出、MCP）
  - GLM-4.5-Flash（标注"即将下线"，不建议新接入使用）
  - GLM-4-Flash-250414（128K / 16K，旧版仍可用）
- **已知信息缺口**：官方文档未公开具体的 QPS/RPM/并发数字。第三方文章给出的数字（如"30 QPS"）时间戳互相矛盾，可信度不足，不采信。真实限额需引导用户登录 [bigmodel.cn](https://bigmodel.cn) 控制台自行查看——智谱的免费额度通常与账户实名认证状态、账户等级相关，非固定值。

### 3.2 主流 LLM API 格式差异（用户自定义订阅 API 场景）

- **关键发现**：OpenAI、Anthropic (Claude)、Google (Gemini) 三家目前都提供官方的"OpenAI 兼容层"：
  - OpenAI：`chat/completions` 是原生协议，事实标准
  - Claude：原生是 Messages API（system 是独立参数、消息必须严格 user/assistant 交替、响应体结构不同），但也有 OpenAI 兼容代理可用
  - Gemini：官方确认提供 [OpenAI compatibility layer](https://ai.google.dev/gemini-api/docs/openai)，可直接用 OpenAI SDK + 改 `base_url` 访问，基础 chat 功能完全兼容，仅部分厂商专属高级功能（如 Claude 的 extended thinking、Gemini 的 thinking_config）需要走 `extra_body` 传递
- **结论**：意群切分是基础文本任务，不需要任何厂商专属高级功能。**"OpenAI Chat Completions 协议"可作为 engine 唯一的网络协议层**，同时覆盖 GLM、OpenAI、Claude（经兼容层）、Gemini（经兼容层）。用户自定义 API 场景下，只需要一份通用配置（baseURL + apiKey + model），不需要为每个厂商单独适配。

## 4. 架构设计：Engine 作为独立层

尽管 MVP 只做浏览器插件，架构上仍把"意群切分能力"抽成一个独立的 engine 层，与插件的 UI/DOM 操作代码分离。原因：

1. 切分逻辑（prompt 构造、LLM 调用、结果解析）与"如何在网页上渲染标注"是两件完全不同的事，分离后各自可以独立测试和迭代
2. 为后续可能的桌面端/移动端扩展保留空间——如果 engine 内部混入了浏览器专属 API（如直接操作 `document`），未来换平台就要重写核心逻辑，而不是复用

**这不代表 MVP 阶段要过度设计多平台抽象**——engine 只需要满足"不引入浏览器专属依赖"这一条约束，不需要现在就去规划桌面/移动端的具体实现细节，那些留到真正要做的时候再设计。

### 4.1 Engine 职责边界

```
Engine 输入：一段英文文本 + Provider 配置（baseURL/apiKey/model）
Engine 输出：结构化的意群切分结果，或标准化的错误

Engine 内部做的事：
├─ 构造意群切分的 prompt
├─ 调用 LLM API（OpenAI 兼容协议）
├─ 解析 LLM 返回内容，转换成结构化 chunk 列表
└─ 把各类失败原因（鉴权失败/限流/超时/网络错误/响应格式异常）归一化成统一错误分类

Engine 不做的事：
├─ 不操作 DOM（这是插件层的职责）
├─ 不渲染任何 UI（这是插件层的职责）
└─ 不做多 provider 降级决策（比如"GLM 失败自动切到用户备用 key"——这是应用层的产品策略，不下沉进 engine）
```

### 4.2 对外核心 API

```
engine.chunk(text: string, options: ChunkOptions) → Promise<ChunkResult>
```

**输入**：
- `text`：一段英文文本
- `options.provider`：`{ baseURL, apiKey, model }`
- `options.granularity`（可选）：切分粒度偏好
- `options.signal`（可选）：用于插件侧取消请求（比如用户切换了页面）

**成功输出**：
```json
{
  "chunks": [
    { "text": "Reading English", "startOffset": 0, "endOffset": 16 },
    { "text": "in phrase chunks", "startOffset": 17, "endOffset": 34 }
  ],
  "meta": {
    "providerUsed": "glm-4.7-flash",
    "latencyMs": 820,
    "tokenUsage": { "prompt": 120, "completion": 45 }
  }
}
```

**失败输出**：
```json
{
  "error": { "code": "RATE_LIMITED", "message": "...", "retryable": true }
}
```

**关键设计决策**：

1. **切分结果携带原文位置（`startOffset`/`endOffset`），而不是重新拼接的文本**
   插件在原始 DOM 文本节点上直接定位高亮区间，不需要做字符串模糊匹配去猜"LLM 输出的这段话对应原文哪里"——避免 LLM 复述文本时的微小改写（多/漏空格、引号变体）导致渲染错位。

2. **错误必须分类，不是笼统的 `Error`**

   | 错误码 | 含义 | 插件侧可能的处理 |
   |---|---|---|
   | `AUTH_FAILED` | API Key 无效/权限不足 | 提示用户检查配置，不该重试 |
   | `RATE_LIMITED` | 触发速率限制 | 提示用户额度已用尽或稍后重试 |
   | `TIMEOUT` | 请求超时 | 可重试 |
   | `SERVICE_UNAVAILABLE` | 服务不可达 | 提示用户检查网络 |
   | `INVALID_RESPONSE` | LLM 返回内容无法解析出切分结果 | 提示用户重试 |
   | `NETWORK_ERROR` | 网络层错误 | 可重试 |

## 5. 浏览器插件实现要点

### 5.1 插件独有的职责（engine 之外的部分）

- 从网页 DOM 提取用户选中或指定区域的英文文本
- 调用 `engine.chunk()` 拿到切分结果
- 根据 `startOffset`/`endOffset` 在原 DOM 上分割文本节点并注入高亮样式/分隔符
- 提供设置页：默认 GLM / 切换到自定义 API Key 的配置界面
- API Key 的本地安全存储（浏览器插件的 storage API，不上传到任何第三方服务器）

### 5.2 跨域请求权限

插件需要在 manifest 中声明对 GLM API（`open.bigmodel.cn`）和用户可能填入的任意自定义 API 域名的请求权限。用户自定义 API 场景下，域名不固定，需要用较宽的 host_permissions 或引导用户在设置页填写后动态申请权限。

## 6. 待用户确认/后续可细化的点

- Provider 的具体错误重试策略（重试几次、间隔多久）本方案未涉及，属于实现细节
- 意群切分的 prompt 具体措辞和 few-shot 示例未在本方案中给出，需要根据实际效果迭代调优
- 是否需要给"用户自定义订阅 API"提供预设的知名厂商快捷配置（下拉选择 OpenAI/Claude/Gemini 自动填充对应 base_url），这是体验细节，不影响本方案架构
- 桌面端/移动端的具体实现方式本方案未展开，按当前架构（engine 层不含浏览器专属依赖）预留了扩展空间，但具体如何在桌面/移动端复用 engine，留到真正规划那期产品时再设计
