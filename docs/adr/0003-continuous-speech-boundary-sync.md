# ADR-0003：意群伴读与语调起伏声学引擎优化

- 状态：已修订（Superseded by Thought-Group Cadence with Continuation Prosody）
- 日期：2026-10-22（修订于 2026-10-23）

## 背景与演进历程

1. **第一代方案（简单分块轮播）**：
   将长句拆成 3~5 词 Chunk 逐段调用 `SpeechSynthesisUtterance`，中间用 `setTimeout(150ms)` 停顿。
   - **痛点**：由于单块文本末尾缺失标点，底层引擎将其作为孤立句（Citation Form）强行句尾重读并深降调，且缺乏语调起伏。

2. **第二代方案尝试（整句单音频流 + onboundary 映射）**：
   将整段原文拼成一条连续的音频流发音，通过监听 `onboundary` 事件驱动意群高亮。
   - **实测痛点**：虽然规避了单块机械降调，但由于整句被一口气读完，**完全丧失了意群之间的呼吸停顿（Thought Group Pauses）与语调起伏（Prosody）**。在真实英文长难句中，TTS 引擎像没有肺活量限制的机器一般连续狂奔，学习者大脑的语音回路（Phonological Loop）无法建立意群锚点，体验极不自然。

3. **第三代定型方案（意群节拍流 + 延续调标点注入 + 智能音色缓存）**：
   - **延续调起伏注入（Continuation Rise）**：非末尾意群若无标点，发音时动态注入轻逗号 `,`。现代神经网络 TTS 模型遇到逗号会自动生成微微上扬或延宕平调（Level / Continuation Pitch），彻底消除机械沉降调。
   - **终结降调保障（Terminal Fall）**：末尾意群补齐句末标点，产生自然的终结降调。
   - **双层生理级停顿**：
     * 句内意群间：180ms 呼吸微停顿（符合母语者阅读与口语换气生理节拍）；
     * 句间边界（`[.!?]`）：320ms 换气大停顿，节奏张弛有度。
   - **异步音色预热与缓存**：监听 `speechSynthesis.onvoiceschanged` 缓存母语高品质音色（如 Google US English、Microsoft Natural、Samantha Enhanced），杜绝回落系统破锣音。

## 收益与契约

- 语调真正拥有真人般自然的「起伏」与「呼吸停顿」；
- 100% 确定性意群视听同步对齐，彻底消除浏览器差异与 `onboundary` 偶发丢失问题；
- 零云端依赖，离线秒级响应，天然免疫 Chromium 15 秒 GC Bug。
