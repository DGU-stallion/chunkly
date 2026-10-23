# 视觉人体工学与流利连贯朗读规范说明 (Sensory Ergonomics and Fluent Reading Spec)

## Problem Statement

学习者在使用 Chunkly 时面临两个核心维度的感知瓶颈：
1. **视觉干扰与选区混色（Visual Fatigue & Selection Conflict）**：当前切分高亮采用了高不透明度（0.88~0.90）的荧光笔背景色，且显式覆盖了字体颜色（`color: #78350F` 等），在长文阅读时产生严重眩光（晃眼）；当用户用鼠标拖选文本时，浏览器原生深色选区与意群底色叠加，造成文字模糊发暗、无法辨识。此外，写死文字颜色破坏了暗黑模式（Dark Mode）与网页宿主原生的字体对比度。
2. **机械发音与连读弱读缺失（Robotic TTS & Fragmented Prosody）**：当前卡拉OK朗读将句子按意群打散成孤立的 `SpeechSynthesisUtterance` 分段发音，导致底层 TTS 引擎将每个意群当作孤立句（Citation Form）强行压低句尾调（Pitch Fall），不仅破坏了英语自然语流的起伏韵律，更物理上掐断了意群间的连读（Linking）和虚词弱读（Weak Forms），听觉机械生硬。

## Solution

1. **人体工学视觉重构**：
   - 将文本颜色全面回归宿主自适应（`color: inherit`），完美兼容浅色/深色主题与各类网站样式；
   - 将高亮层转变为**优雅点阵虚线下划线（Minimal Dot Accent）**辅以极低浓度呼吸背景（透明度降至 0.08~0.16），消除眩光感；
   - 接管 `::selection` 与高亮伪类，确保用户划选文本时高亮底色主动退让，选区文字清爽锐利。
2. **流利语流双模声学引擎**：
   - **卡拉OK伴读模式（Fluent Stream）**：将整句作为一个完整音频流送入 TTS 引擎，监听 Web Speech API 标准 `onboundary`（Word Boundary）事件，依据字符偏移量（`charIndex`）毫秒级动态激活对应意群高亮。彻底释放引擎的整句音调起伏、母语者自然连读与虚词弱读；
   - **影子跟读模式（Shadowing Drill）**：保留发音留白机制，但对意群追加非终结性韵律线索，消除生硬的句尾重沉音。

## User Stories

1. As a reader, I want chunk highlights to use soft accents and inherit my page's text color, so that my eyes do not get fatigued by glaring fluorescent backgrounds.
2. As a reader using dark mode or custom website themes, I want chunk text to remain high-contrast and natural, so that dark backgrounds are not broken by muddy text styling.
3. As a reader selecting text with my mouse, I want the selection highlight not to conflict or blend muddily with chunk backgrounds, so that selected words remain crystal clear.
4. As a language learner listening in Karaoke mode, I want the voice to read the entire sentence with natural English intonation, linking, and weak forms, so that I acquire genuine native-speaker prosody.
5. As a language learner listening in Karaoke mode, I want the visual focus highlight to smoothly track the speech word by word across chunks, so that my inner speech stays in perfect synchrony with the voice.
6. As a language learner practicing speaking in Shadowing mode, I want pauses between chunks to allow me time to repeat, so that my phonological loop actively encodes the phrase.
7. As a reader, I want the player bar controls (play/pause, mode switch, speed toggle) to seamlessly control continuous playback without lag, so that my reading flow is not interrupted.

## Implementation Decisions

1. **Visual Styling Modernization (`apps/extension/src/content.css`)**:
   - For `.chunkly-chunk` and `::highlight(chunkly-*)`:
     - Set `color: inherit !important` to respect host page typography and dark mode.
     - Set `background-color` to subtle pastels with opacity 0.10 ~ 0.15.
     - Add `border-bottom: 2px dotted ...` (or dashed) with matching low-saturation tones.
     - Add explicit `.chunkly-chunk::selection` overrides (`background: rgba(59, 130, 246, 0.3); color: inherit;`) so browser selection never blurs text.
   - For `.chunkly-chunk-active` and `::highlight(chunkly-active)`:
     - Set soft warm accent spotlight `rgba(254, 240, 138, 0.45)` with `2px solid #4F46E5` bottom indicator for crisp visibility without visual jarring.

2. **Continuous Speech Boundary Engine (`apps/extension/src/tts.ts`)**:
   - In `createTTSPlayer`:
     - When `mode === "karaoke"`, construct a single continuous sentence `SpeechSynthesisUtterance` encompassing the full text of all chunks.
     - Bind `utterance.onboundary` to capture `event.charIndex`.
     - Implement binary/range lookup to locate the active `ChunkItem` containing `charIndex`, firing `onChunkStart(index, chunk)` whenever the boundary crosses into a new chunk.
     - Provide fallback for completion via `utterance.onend`.
     - When `mode === "shadowing"`, maintain the chunk-by-chunk interval loop with dynamic pauses.

3. **DOM & Content Integration (`apps/extension/src/content.ts` & `apps/extension/src/highlight.ts`)**:
   - Pass continuous chunk stream to `ttsPlayer.play(chunks, options)`.
   - Update `setActiveHighlightChunk` to smoothly update both CSS Custom Highlight API and DOM span mode.
   - Ensure `undoHighlight` clears any ongoing speech and player controls cleanly.

4. **Architectural Constraints & ADR Compliance**:
   - Zero runtime dependencies for `@chunkly/engine`.
   - Zero external model downloads; fully leverages browser native Neural Speech Synthesis.
   - Respects ADR-0001 (Preserve DOM text nodes) and ADR-0002 (Background owns network).

## Testing Decisions

1. **Seam: CSS Style & Selection Rules (`apps/extension/test/highlight.dom.test.ts`)**:
   - Verify that rendered spans inherit text color and include the appropriate class tags.
   - Verify that active highlight class is cleanly toggled and does not mutate DOM node identity.
2. **Seam: Speech Player Core (`apps/extension/test/tts.test.ts`)**:
   - Verify Karaoke mode issues a single continuous `SpeechSynthesisUtterance` with full sentence text.
   - Verify `onboundary` dispatches `onChunkStart` with accurate chunk indices based on `charIndex`.
   - Verify Shadowing mode retains sequential chunk playback with pauses.
   - Verify pause/resume/stop and completion callbacks remain robust under continuous streaming.

## Out of Scope

- Cloud neural TTS via paid APIs (Azure, ElevenLabs) — out of scope for this lightweight local release.
- Audio recording / microphone input waveform evaluation — scheduled for Phase 2/3.
- User custom theme color picker UI in options page — to be evaluated after default visual baseline is perfected.

## Further Notes

- Chrome, Safari, and Edge all support the `SpeechSynthesisUtterance.onboundary` event with word boundaries.
