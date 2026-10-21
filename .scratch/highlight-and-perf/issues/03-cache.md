# 03 — 切分结果缓存

Status: done
Blocked by: None

## 要交付的行为

同一段文本 + 同一 provider/model/effort 再次切分时，直接命中缓存，不发起网络请求。阅读场景里重复率很高（翻页回来、重新选中、同一篇文章重开）。

## 为什么

P0-3。1 小时工作量，命中即 0ms / 0 成本，是当前投入产出比最高的一项。

## 验收

- 相同 key 第二次调用不再 `fetch`（测试断言 fetch 只被调用一次）。
- 不同 model / effort / granularity 视为不同 key。
- 缓存有过期或容量上限，不会无限增长。
- 缓存损坏/不存在时静默 miss，不影响功能。
