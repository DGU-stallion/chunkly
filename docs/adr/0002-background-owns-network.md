# ADR-0002：网络请求与密钥只存在于 background service worker

- 状态：已接受
- 日期：2026-10-20

## 背景

最初的实现让 content script 直接 `fetch` LLM API。这在两个层面出问题。

## 问题

**1. 本机网关会拒绝页面 origin。**

实测 magpie 网关对 `Origin` 的处理：

| Origin | 结果 |
|---|---|
| `https://example.com` | `403 permission_error` |
| `chrome-extension://<id>` | `200 OK` |
| 无 Origin（CLI） | `200 OK` |

content script 的 `fetch` 携带的是**页面** origin，因此被拒。service worker 的 origin 是 `chrome-extension://<id>`，放行。

**2. 密钥暴露在页面进程。**

content script 和宿主页面共享同一个渲染进程。把 API Key 放进 content script，意味着页面所在进程可以读到它。这与 `CODING_STANDARDS.md` 的安全条款冲突。

## 决策

- 所有 LLM 网络请求在 `background.ts`（service worker）中发起。
- API Key 只从 `chrome.storage.local` 在 background 内读取，永不传给 content script。
- content script 通过 `chrome.runtime.sendMessage({ type: "CHUNKLY_CHUNK", text })` 请求切分。
- 错误以 `{ ok: false, error: { code, message, retryable } }` 结构化返回，content script 只做用户提示映射。

## 后果

- 本机网关与云端 provider 用同一条路径，无需区分。
- content script 体积小（不含 provider 逻辑），产物经静态检查确认不含 `127.0.0.1` / `bigmodel.cn` / `Bearer`。
- 代价：多一次消息往返（实测可忽略，远小于 LLM 的秒级延迟）。
- 代价：MV3 service worker 会被回收，不能持有长生命周期状态。当前实现不依赖跨请求状态，无影响。
