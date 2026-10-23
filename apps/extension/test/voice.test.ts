import { describe, it, expect } from "vitest";
import { pickBestVoice, isNoveltyVoice, type VoiceDescriptor } from "../src/voice.js";

describe("isNoveltyVoice 过滤恶搞与低质机械音", () => {
  it("识别并排除经典恶搞/低音质音色（如 Albert, Bad News, Boing, Fred, Wobble 等）", () => {
    expect(isNoveltyVoice("Albert")).toBe(true);
    expect(isNoveltyVoice("Bad News")).toBe(true);
    expect(isNoveltyVoice("Boing")).toBe(true);
    expect(isNoveltyVoice("Fred")).toBe(true);
    expect(isNoveltyVoice("Wobble")).toBe(true);
    expect(isNoveltyVoice("Zarvox")).toBe(true);
  });

  it("正常音色不被误杀", () => {
    expect(isNoveltyVoice("Google US English")).toBe(false);
    expect(isNoveltyVoice("Microsoft Jenny Online (Natural) - English (United States)")).toBe(false);
    expect(isNoveltyVoice("Samantha (Enhanced)")).toBe(false);
    expect(isNoveltyVoice("Daniel")).toBe(false);
  });
});

describe("pickBestVoice 智能挑选最高品质母语者音色", () => {
  it("首选：微软 Natural / 神经音色（如果系统提供）", () => {
    const voices: VoiceDescriptor[] = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Samantha", lang: "en-US", default: false },
      { name: "Microsoft Jenny Online (Natural) - English (United States)", lang: "en-US", default: false },
    ];

    const best = pickBestVoice(voices, "en-US");
    expect(best?.name).toBe("Microsoft Jenny Online (Natural) - English (United States)");
  });

  it("次选：Google Chrome 原生高质量音色（Google US English）", () => {
    const voices: VoiceDescriptor[] = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Samantha", lang: "en-US", default: false },
      { name: "Google US English", lang: "en-US", default: false },
    ];

    const best = pickBestVoice(voices, "en-US");
    expect(best?.name).toBe("Google US English");
  });

  it("三选：macOS Enhanced / Premium 增强音色", () => {
    const voices: VoiceDescriptor[] = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Samantha (Enhanced)", lang: "en-US", default: false },
      { name: "Fred", lang: "en-US", default: false },
    ];

    const best = pickBestVoice(voices, "en-US");
    expect(best?.name).toBe("Samantha (Enhanced)");
  });

  it("当只有普通英文音色时，选正常人声音色（如 Samantha/Daniel），坚决避开 Albert/Fred", () => {
    const voices: VoiceDescriptor[] = [
      { name: "Albert", lang: "en-US", default: true },
      { name: "Samantha", lang: "en-US", default: false },
      { name: "Fred", lang: "en-US", default: false },
    ];

    const best = pickBestVoice(voices, "en-US");
    expect(best?.name).toBe("Samantha");
  });

  it("支持指定偏好音色类型（如美音 US vs 英音 GB）", () => {
    const voices: VoiceDescriptor[] = [
      { name: "Google UK English Female", lang: "en-GB", default: false },
      { name: "Google US English", lang: "en-US", default: false },
    ];

    const usBest = pickBestVoice(voices, "en-US");
    expect(usBest?.name).toBe("Google US English");

    const ukBest = pickBestVoice(voices, "en-GB");
    expect(ukBest?.name).toBe("Google UK English Female");
  });
});
