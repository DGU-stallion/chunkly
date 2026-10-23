import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createTTSPlayer,
  computeShadowingPauseMs,
  type SpeechSynthesisLike,
  type ChunkItem,
} from "../src/tts.js";

describe("computeShadowingPauseMs 计算影子跟读停顿留白", () => {
  it("基础停顿公式：音频时长 * 1.2 + 200ms", () => {
    // 假设一个短意群朗读了 1000ms
    const pause = computeShadowingPauseMs(1000);
    expect(pause).toBe(1400); // 1000 * 1.2 + 200 = 1400ms
  });

  it("设有保底最小停顿（800ms）与最大上限（4000ms）", () => {
    // 极短意群 (200ms) -> 不低于 800ms
    expect(computeShadowingPauseMs(200)).toBe(800);

    // 极长意群 (4000ms -> 4000*1.2+200=5000) -> 上限 4000ms
    expect(computeShadowingPauseMs(4000)).toBe(4000);
  });
});

describe("TTS 意群播放器核心状态机", () => {
  let mockSynth: SpeechSynthesisLike;
  let speakingUtterance: any = null;

  beforeEach(() => {
    vi.useFakeTimers();

    mockSynth = {
      speaking: false,
      paused: false,
      speak: vi.fn((utt) => {
        mockSynth.speaking = true;
        speakingUtterance = utt;
      }),
      cancel: vi.fn(() => {
        mockSynth.speaking = false;
        speakingUtterance = null;
      }),
      pause: vi.fn(() => {
        mockSynth.paused = true;
      }),
      resume: vi.fn(() => {
        mockSynth.paused = false;
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const testChunks: ChunkItem[] = [
    { text: "In the early morning,", startOffset: 0, endOffset: 21 },
    { text: " the stock market", startOffset: 21, endOffset: 38 },
    { text: " crashed unexpectedly.", startOffset: 38, endOffset: 60 },
  ];

  it("初始状态为 idle，stop 状态安全", () => {
    const player = createTTSPlayer({ synth: mockSynth });
    expect(player.isPlaying()).toBe(false);
    expect(player.getCurrentIndex()).toBe(-1);

    player.stop();
    expect(mockSynth.cancel).toHaveBeenCalled();
  });

  it("卡拉OK伴读模式：按意群逐块发音，注入延续调与呼吸微停顿，精准视听高亮跟随", () => {
    const onChunkStart = vi.fn();
    const onChunkEnd = vi.fn();
    const onComplete = vi.fn();

    const player = createTTSPlayer({ synth: mockSynth });

    player.play(testChunks, {
      mode: "karaoke",
      rate: 1.0,
      microPauseMs: 180,
      onChunkStart,
      onChunkEnd,
      onComplete,
    });

    expect(player.isPlaying()).toBe(true);

    // 意群 0：包含逗号，发音保留原标点
    expect(mockSynth.speak).toHaveBeenCalledTimes(1);
    expect(speakingUtterance.text).toBe("In the early morning,");
    expect(onChunkStart).toHaveBeenCalledWith(0, testChunks[0]);

    // 模拟意群 0 发音结束
    speakingUtterance.onend?.();
    expect(onChunkEnd).toHaveBeenCalledWith(0, testChunks[0]);

    // 179ms 处于呼吸微停顿区间，尚未开始意群 1
    vi.advanceTimersByTime(179);
    expect(mockSynth.speak).toHaveBeenCalledTimes(1);

    // 满 180ms 停顿后，启动意群 1
    vi.advanceTimersByTime(1);
    expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    // 关键声学起伏断言：非末尾意群自动追加轻逗号促使语音引擎生成「延续升调（Continuation Rise）」
    expect(speakingUtterance.text).toBe("the stock market,");
    expect(onChunkStart).toHaveBeenCalledWith(1, testChunks[1]);

    // 模拟意群 1 发音结束
    speakingUtterance.onend?.();
    expect(onChunkEnd).toHaveBeenCalledWith(1, testChunks[1]);

    // 跨过 180ms 微停顿进入意群 2
    vi.advanceTimersByTime(180);
    expect(mockSynth.speak).toHaveBeenCalledTimes(3);
    // 句末终结降调：保留句号
    expect(speakingUtterance.text).toBe("crashed unexpectedly.");
    expect(onChunkStart).toHaveBeenCalledWith(2, testChunks[2]);

    // 意群 2 发音结束，全段完成
    speakingUtterance.onend?.();
    expect(onChunkEnd).toHaveBeenCalledWith(2, testChunks[2]);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
  });

  it("影子跟读模式：播放完意群后触发停顿跟读事件，等待用户跟读完毕再播放下一块", () => {
    const onChunkStart = vi.fn();
    const onShadowPause = vi.fn();

    const player = createTTSPlayer({ synth: mockSynth });

    player.play(testChunks, {
      mode: "shadowing",
      rate: 1.0,
      onChunkStart,
      onShadowPause,
    });

    expect(onChunkStart).toHaveBeenCalledWith(0, testChunks[0]);

    // 假设朗读耗时 1000ms
    vi.advanceTimersByTime(1000);
    speakingUtterance.onend?.();

    // 应该触发 onShadowPause 回调 (停顿 1000 * 1.2 + 200 = 1400ms)
    expect(onShadowPause).toHaveBeenCalledWith(0, 1400);

    // 在 1399ms 尚未开始第二个意群
    vi.advanceTimersByTime(1399);
    expect(onChunkStart).toHaveBeenCalledTimes(1);

    // 满 1400ms 时开始第二个意群
    vi.advanceTimersByTime(1);
    expect(onChunkStart).toHaveBeenCalledWith(1, testChunks[1]);
  });

  it("自动为 Utterance 匹配并赋予高品质母语 Voice（避开系统默认机械音）", () => {
    const mockVoices = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Google US English", lang: "en-US", default: false },
    ];
    mockSynth.getVoices = vi.fn().mockReturnValue(mockVoices);

    const player = createTTSPlayer({ synth: mockSynth });
    player.play(testChunks, { lang: "en-US" });

    expect(speakingUtterance).not.toBeNull();
    // 关键断言：utterance.voice 必须显式绑定为优质音色，绝不留空
    expect(speakingUtterance.voice?.name).toBe("Google US English");
  });

  it("当音色列表异步加载（初期为空）时，通过 onvoiceschanged 自动缓存最新优质音色", () => {
    // 初始为空（模拟 Chrome 冷启动）
    let currentVoiceList: any[] = [];
    mockSynth.getVoices = vi.fn(() => currentVoiceList);

    const player = createTTSPlayer({ synth: mockSynth });

    // 随后系统触发 onvoiceschanged 事件
    currentVoiceList = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Microsoft Jenny Online (Natural)", lang: "en-US", default: false },
    ];
    if (mockSynth.onvoiceschanged) {
      mockSynth.onvoiceschanged({} as any);
    }

    player.play(testChunks, { lang: "en-US" });

    expect(speakingUtterance).not.toBeNull();
    expect(speakingUtterance.voice?.name).toBe("Microsoft Jenny Online (Natural)");
  });

  it("连续语流下暂停、继续与中途停止能正确控制底层 synth 与播放状态", () => {
    const player = createTTSPlayer({ synth: mockSynth });
    player.play(testChunks, { mode: "karaoke" });

    expect(player.isPlaying()).toBe(true);
    expect(player.isPaused()).toBe(false);
    // play() 启动时会先安全 stop() 取消之前的旧发音
    expect(mockSynth.cancel).toHaveBeenCalledTimes(1);

    player.pause();
    expect(mockSynth.pause).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
    expect(player.isPaused()).toBe(true);

    player.resume();
    expect(mockSynth.resume).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(true);
    expect(player.isPaused()).toBe(false);

    player.stop();
    expect(mockSynth.cancel).toHaveBeenCalledTimes(2);
    expect(player.isPlaying()).toBe(false);
    expect(player.isPaused()).toBe(false);
  });

  it("影子跟读模式在停顿期间重新调用 play()，旧会话的定时器被作废，绝不发生乱序并发播放", () => {
    const onChunkStart = vi.fn();
    const player = createTTSPlayer({ synth: mockSynth });

    player.play(testChunks, {
      mode: "shadowing",
      onChunkStart,
    });

    expect(onChunkStart).toHaveBeenCalledWith(0, testChunks[0]);

    // 意群 0 发音完毕，进入影子留白停顿（假设 1400ms）
    speakingUtterance.onend?.();
    expect(onChunkStart).toHaveBeenCalledTimes(1);

    // 在停顿等待 500ms 时，用户切换了模式或点击重新播放
    vi.advanceTimersByTime(500);
    player.play(testChunks, {
      mode: "shadowing",
      onChunkStart,
    });

    // 新会话启动，再次播放意群 0
    expect(onChunkStart).toHaveBeenCalledTimes(2);
    expect(onChunkStart).toHaveBeenLastCalledWith(0, testChunks[0]);

    // 时间流逝 1000ms（此时旧会话原本的 1400ms 计时器原本会触发意群 1）
    vi.advanceTimersByTime(1000);

    // 关键断言：旧会话的定时器已被完全隔离作废，绝没有触发并发的意群 1！
    expect(onChunkStart).toHaveBeenCalledTimes(2);
  });

  it("影子跟读模式在停顿等待期间点击暂停与继续，正确保持剩余等待时间并有序播放下一块", () => {
    const onChunkStart = vi.fn();
    const player = createTTSPlayer({ synth: mockSynth });

    player.play(testChunks, {
      mode: "shadowing",
      onChunkStart,
    });

    // 意群 0 发音 1000ms 后结束，进入 1400ms 停顿等待
    vi.advanceTimersByTime(1000);
    speakingUtterance.onend?.();

    // 在第 400ms 时用户暂停（剩余 1000ms）
    vi.advanceTimersByTime(400);
    player.pause();
    expect(player.isPaused()).toBe(true);

    // 哪怕过去 2000ms，在暂停状态下决不推进
    vi.advanceTimersByTime(2000);
    expect(onChunkStart).toHaveBeenCalledTimes(1);

    // 用户点击继续
    player.resume();
    expect(player.isPaused()).toBe(false);

    // 推进 999ms，依然未到期
    vi.advanceTimersByTime(999);
    expect(onChunkStart).toHaveBeenCalledTimes(1);

    // 补齐最后 1ms（满 1000ms 剩余时间），有序启动意群 1
    vi.advanceTimersByTime(1);
    expect(onChunkStart).toHaveBeenCalledTimes(2);
    expect(onChunkStart).toHaveBeenLastCalledWith(1, testChunks[1]);
  });

  it("若提供了 fetchAudio（如 Google Translate 神经原声），优先调用云端高保真音频流播放", async () => {
    let playedAudioUrl = "";
    const originalAudio = (globalThis as any).Audio;

    (globalThis as any).Audio = class MockAudio {
      src: string;
      playbackRate = 1.0;
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(src: string) {
        this.src = src;
        playedAudioUrl = src;
      }
      play() {
        return Promise.resolve();
      }
      pause() {}
    };

    const fetchAudio = vi.fn().mockResolvedValue("data:audio/mpeg;base64,mockGoogleMp3");
    const onChunkStart = vi.fn();
    const player = createTTSPlayer({ synth: mockSynth, fetchAudio });

    player.play(testChunks, { onChunkStart });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchAudio).toHaveBeenCalledWith("In the early morning,", "en-US");
    expect(playedAudioUrl).toBe("data:audio/mpeg;base64,mockGoogleMp3");
    expect(onChunkStart).toHaveBeenCalledWith(0, testChunks[0]);

    (globalThis as any).Audio = originalAudio;
  });
});
