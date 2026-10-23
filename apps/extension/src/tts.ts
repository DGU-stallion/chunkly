/**
 * 意群卡拉OK朗读（Thought-Group Karaoke）与影子跟读（Shadowing）播放引擎。
 *
 * 核心设计准则（基于 SLA 二语习得与认知心理学）：
 * 1. 意群级发音单元：按 3~5 词 Chunk 逐段分发，杜绝整句流水账朗读；
 * 2. 韵律微停顿：卡拉OK模式在意群间插入 120~200ms 微停顿（符合母语者呼吸周期）；
 * 3. 影子跟读留白：影子模式在每个 Chunk 发音结束后留出 (时长 * 1.2 + 200ms) 的跟读时间，
 *    精准借用语音回路（Phonological Loop）的 2 秒短期记忆黄金窗口。
 * 4. 免疫 Chrome 15 秒 GC Bug：短块轮播机制天然规避 Blink 内核的长文本朗读中断缺陷。
 */

import { pickBestVoice, type VoiceDescriptor } from "./voice.js";

export type TTSMode = "karaoke" | "shadowing";

export interface ChunkItem {
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface TTSPlayerOptions {
  mode?: TTSMode;
  rate?: number; // 0.5 - 2.0 (默认 1.0)
  lang?: string; // 默认 "en-US"
  microPauseMs?: number; // 卡拉OK模式意群间微停顿（默认 150ms）
  onChunkStart?: (index: number, chunk: ChunkItem) => void;
  onChunkEnd?: (index: number, chunk: ChunkItem) => void;
  onShadowPause?: (index: number, pauseDurationMs: number) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface SpeechSynthesisLike {
  speaking: boolean;
  paused: boolean;
  speak: (utterance: SpeechSynthesisUtteranceLike) => void;
  cancel: () => void;
  pause: () => void;
  resume: () => void;
  getVoices?: () => VoiceDescriptor[];
  onvoiceschanged?: ((this: SpeechSynthesisLike, ev: unknown) => unknown) | null;
}

export type SpeechSynthesisUtteranceLike =
  | SpeechSynthesisUtterance
  | {
      text: string;
      lang: string;
      rate: number;
      voice?: unknown;
      onstart?: (() => void) | null;
      onboundary?: (() => void) | null;
      onend?: (() => void) | null;
      onerror?: (() => void) | null;
    };

/** 计算影子跟读动态停顿时间（保底 800ms，上限 4000ms） */
export function computeShadowingPauseMs(speechDurationMs: number): number {
  const calculated = Math.round(speechDurationMs * 1.2 + 200);
  return Math.max(800, Math.min(4000, calculated));
}

export interface TTSPlayer {
  play: (chunks: ChunkItem[], options?: TTSPlayerOptions) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  isPlaying: () => boolean;
  isPaused: () => boolean;
  getCurrentIndex: () => number;
  getMode: () => TTSMode;
}

export interface TTSPlayerDeps {
  synth?: SpeechSynthesisLike;
  fetchAudio?: (text: string, lang: string) => Promise<string | null>;
}

export function createTTSPlayer(deps?: TTSPlayerDeps): TTSPlayer {
  const synth: SpeechSynthesisLike | null =
    deps?.synth ??
    (typeof window !== "undefined" && "speechSynthesis" in window
      ? (window.speechSynthesis as unknown as SpeechSynthesisLike)
      : null);

  let currentSessionId = 0;
  let activeChunks: ChunkItem[] = [];
  let currentOptions: TTSPlayerOptions = {};
  let currentIndex = -1;
  let playing = false;
  let paused = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let chunkStartTime = 0;

  // 影子跟读与换气停顿计时器状态
  let pauseTimerScheduledAt = 0;
  let pauseTimerDurationMs = 0;
  let pendingNextIndex = -1;
  let currentAudioElement: HTMLAudioElement | null = null;

  // 异步音色预热与缓存：彻底解决初次加载 getVoices() 为空的问题
  let cachedVoices: VoiceDescriptor[] = [];
  function refreshVoices(): void {
    if (synth?.getVoices) {
      try {
        const v = synth.getVoices();
        if (Array.isArray(v) && v.length > 0) {
          cachedVoices = v;
        }
      } catch {
        // ignore
      }
    }
  }
  refreshVoices();
  if (synth) {
    try {
      synth.onvoiceschanged = () => {
        refreshVoices();
      };
    } catch {
      // ignore
    }
  }

  function getAvailableVoices(): VoiceDescriptor[] {
    if (synth?.getVoices) {
      const v = synth.getVoices();
      if (Array.isArray(v) && v.length > 0) return v;
    }
    return cachedVoices;
  }

  function clearPendingTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    pendingNextIndex = -1;
    pauseTimerDurationMs = 0;
  }

  function stop(): void {
    currentSessionId++; // 核心生命周期守卫：自增会话号，使之前所有未决的回调瞬间作废
    clearPendingTimer();
    if (currentAudioElement) {
      try {
        currentAudioElement.pause();
        currentAudioElement.src = "";
      } catch {
        // ignore
      }
      currentAudioElement = null;
    }
    playing = false;
    paused = false;
    currentIndex = -1;
    activeChunks = [];
    synth?.cancel();
  }

  function playChunk(index: number, sessionId: number): void {
    // 关键守卫：会话已变更或已停止播放，拒绝执行
    if (sessionId !== currentSessionId || !playing) return;

    if (index >= activeChunks.length) {
      stop();
      currentOptions.onComplete?.();
      return;
    }

    currentIndex = index;
    const item = activeChunks[index];
    let textToSpeak = item.text.trim();

    // 如果该 chunk 纯属空白或标点，快速跳到下一个
    if (textToSpeak.length === 0 || !/[a-zA-Z]/.test(textToSpeak)) {
      playChunk(index + 1, sessionId);
      return;
    }

    // 意群语调起伏与呼吸韵律优化（SLA 韵律金字塔原则）：
    // 若非末尾意群且末尾无标点，追加轻逗号促使底层语音引擎生成「延续升调（Continuation Rise）」的自然升平调，
    // 杜绝孤立词块产生机械沉降调；
    // 最后一个意群若无标点，追加句号促使生成自然的「终结降调（Terminal Fall）」。
    const isLast = index + 1 >= activeChunks.length;
    const hasPunctuation = /[,.!?:;—–]$/.test(textToSpeak);
    if (!hasPunctuation) {
      if (!isLast) {
        textToSpeak = `${textToSpeak},`;
      } else {
        textToSpeak = `${textToSpeak}.`;
      }
    }

    const rate = currentOptions.rate ?? 1.0;
    const lang = currentOptions.lang ?? "en-US";

    currentOptions.onChunkStart?.(index, item);
    chunkStartTime = Date.now();

    function onChunkFinished(): void {
      if (sessionId !== currentSessionId || !playing) return;
      const speechDuration = Math.max(100, Date.now() - chunkStartTime);
      currentOptions.onChunkEnd?.(index, item);

      // 如果已是最后一个意群，直接宣告朗读完成
      if (index + 1 >= activeChunks.length) {
        stop();
        currentOptions.onComplete?.();
        return;
      }

      // 计算下一个意群前的呼吸停顿时间：
      // - 影子跟读模式 (shadowing)：动态留白供用户开口复述（音频时长 * 1.2 + 200ms）
      // - 卡拉OK伴读模式 (karaoke)：
      //   * 若遇到句末标点 ([.!?])：插入 320ms 句间自然换气停顿
      //   * 意群间正常停顿：插入 microPauseMs（默认 180ms，符合母语者生理意群节奏）
      const mode = currentOptions.mode ?? "karaoke";
      let pauseMs: number;
      if (mode === "shadowing") {
        pauseMs = computeShadowingPauseMs(speechDuration);
        currentOptions.onShadowPause?.(index, pauseMs);
      } else {
        const isSentenceEnd = /[.!?]$/.test(item.text.trim());
        pauseMs = isSentenceEnd ? 320 : (currentOptions.microPauseMs ?? 180);
      }

      clearPendingTimer();
      pendingNextIndex = index + 1;
      pauseTimerDurationMs = pauseMs;
      pauseTimerScheduledAt = Date.now();

      if (paused) return;

      timerId = setTimeout(() => {
        if (sessionId === currentSessionId && playing && !paused) {
          clearPendingTimer();
          playChunk(index + 1, sessionId);
        }
      }, pauseMs);
    }

    // 优先尝试外部高品质流式发音接口（如 Google Translate / Edge TTS 原声）
    if (deps?.fetchAudio) {
      deps
        .fetchAudio(textToSpeak, lang)
        .then((audioUrl) => {
          if (sessionId !== currentSessionId || !playing) return;
          if (audioUrl && typeof Audio !== "undefined") {
            const audio = new Audio(audioUrl);
            currentAudioElement = audio;
            audio.playbackRate = rate;
            audio.onended = () => {
              currentAudioElement = null;
              onChunkFinished();
            };
            audio.onerror = () => {
              currentAudioElement = null;
              if (!paused) {
                speakWithLocalSynth();
              }
            };
            // 关键：若网络请求期间用户已触发暂停，保留 currentAudioElement 引用以备 resume，绝不在暂停状态突发播放
            if (!paused) {
              const p = audio.play();
              if (p && typeof p.catch === "function") {
                p.catch(() => {
                  currentAudioElement = null;
                  if (!paused) {
                    speakWithLocalSynth();
                  }
                });
              }
            }
            return;
          }
          if (!paused) {
            speakWithLocalSynth();
          }
        })
        .catch(() => {
          if (sessionId !== currentSessionId || !playing) return;
          if (!paused) {
            speakWithLocalSynth();
          }
        });
      return;
    }

    speakWithLocalSynth();

    function speakWithLocalSynth(): void {
      if (sessionId !== currentSessionId || !playing || !synth) return;

      let utterance: SpeechSynthesisUtteranceLike;
      if (typeof SpeechSynthesisUtterance !== "undefined") {
        utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = rate;
        utterance.lang = lang;
      } else {
        utterance = {
          text: textToSpeak,
          rate,
          lang,
        };
      }

      // 智能绑定高品质母语 Voice（优先 Microsoft Natural / Google US English / Apple Enhanced）
      const availableVoices = getAvailableVoices();
      const bestVoice = pickBestVoice(availableVoices, lang);
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onend = () => {
        if (sessionId !== currentSessionId || !playing) return;
        onChunkFinished();
      };

      utterance.onerror = () => {
        if (sessionId !== currentSessionId || !playing) return;
        // 容错：错误时仍尝试平稳推进
        onChunkFinished();
      };

      synth.speak(utterance);
    }
  }

  function play(chunks: ChunkItem[], options?: TTSPlayerOptions): void {
    stop();
    if (chunks.length === 0) return;

    activeChunks = [...chunks];
    currentOptions = { ...options };
    playing = true;
    paused = false;
    const sessionId = currentSessionId;

    playChunk(0, sessionId);
  }

  function pause(): void {
    if (playing && !paused) {
      paused = true;
      if (currentAudioElement) {
        try {
          currentAudioElement.pause();
        } catch {
          // ignore
        }
      }
      if (synth) {
        synth.pause();
      }
      // 如果正处于影子跟读停顿计时中，暂停倒计时并保存剩余毫秒数
      if (timerId !== null) {
        const elapsed = Date.now() - pauseTimerScheduledAt;
        pauseTimerDurationMs = Math.max(0, pauseTimerDurationMs - elapsed);
        clearTimeout(timerId);
        timerId = null;
      }
    }
  }

  function resume(): void {
    if (playing && paused) {
      paused = false;
      const sessionId = currentSessionId;
      if (pendingNextIndex !== -1 && timerId === null) {
        // 如果之前停在停顿等待期，按剩余时间恢复倒计时
        const nextIndex = pendingNextIndex;
        pauseTimerScheduledAt = Date.now();
        timerId = setTimeout(() => {
          if (sessionId === currentSessionId && playing && !paused) {
            clearPendingTimer();
            playChunk(nextIndex, sessionId);
          }
        }, pauseTimerDurationMs);
      } else if (currentAudioElement) {
        try {
          currentAudioElement.play();
        } catch {
          // ignore
        }
      } else if (synth && synth.paused) {
        synth.resume();
      } else if (currentIndex >= 0) {
        // 若在音频准备/网络拉取期间暂停，恢复时重新触发当前意群发音
        playChunk(currentIndex, sessionId);
      }
    }
  }

  return {
    play,
    pause,
    resume,
    stop,
    isPlaying: () => playing && !paused,
    isPaused: () => paused,
    getCurrentIndex: () => currentIndex,
    getMode: () => currentOptions.mode ?? "karaoke",
  };
}
