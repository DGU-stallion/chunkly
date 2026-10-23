# 02 — 整句连续语流与词边界毫秒级同步 (Continuous Speech & Boundary Sync)

**What to build:**
升级 `tts.ts` 播放引擎。在卡拉OK模式下，由“逐个意群分别创建 Utterance 朗读”重构成“整句连续音频流合成 + `onboundary` 事件实时追踪”。将完整文本送入底层语音引擎，通过浏览器的 `word` boundary 事件获取实时字符偏移 `charIndex`，动态映射并触发当前意群高亮，彻底激活母语者级别的全局音调起伏（Intonation Contour）、自然连读（Linking）与虚词弱读（Weak Forms）。同时影子跟读模式（Shadowing）保持带发音留白的意群训练流。

**Blocked by:** None (can start immediately)

**Status:** done

## Acceptance Criteria
- [x] `createTTSPlayer` 在 `mode: "karaoke"` 时将意群拼合为连续语流，发起单次 `SpeechSynthesisUtterance` 完整发音。
- [x] 监听 `utterance.onboundary`，基于 `charIndex` 实时计算当前命中的意群索引，并派发 `onChunkStart(index, chunk)`。
- [x] 当前意群跨越到下一个时，正确触发 `onChunkEnd` 与后续 `onChunkStart`，朗读完成时触发 `onComplete`。
- [x] `mode: "shadowing"` 维持原有分块留白模式，支持动态间隔复述。
- [x] 完善单元测试 `apps/extension/test/tts.test.ts`，验证连续语流与边界事件处理机制，覆盖率达标且所有用例绿灯。
