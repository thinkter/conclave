import { describe, expect, it } from "vitest";
import {
  analyzePcm16Base64,
  createSilentPcm16Base64,
  estimatePcm16Base64SampleCount,
  redactSensitiveText,
} from "../transcript-worker/src/utils";

describe("redactSensitiveText", () => {
  it("redacts OpenAI-looking keys from propagated errors", () => {
    expect(
      redactSensitiveText(
        "Incorrect API key provided: sk-project_1234567890abcdef",
      ),
    ).toBe("Incorrect API key provided: sk-...[redacted]");
  });

  it("leaves ordinary text unchanged", () => {
    expect(redactSensitiveText("Realtime transcription failed.")).toBe(
      "Realtime transcription failed.",
    );
  });
});

describe("PCM16 base64 helpers", () => {
  it("estimates 2048 PCM16 samples as the short 85ms worklet chunk", () => {
    const audio = createSilentPcm16Base64(2048);

    expect(estimatePcm16Base64SampleCount(audio)).toBe(2048);
  });

  it("creates 100ms of 24kHz PCM16 silence", () => {
    const audio = createSilentPcm16Base64(2400);

    expect(estimatePcm16Base64SampleCount(audio)).toBe(2400);
  });

  it("analyzes PCM16 audio without exposing sample data", () => {
    const audio = btoa(
      String.fromCharCode(
        0x00,
        0x00,
        0xff,
        0x7f,
        0x00,
        0x80,
        0x00,
        0x00,
      ),
    );

    expect(analyzePcm16Base64(audio, 24_000)).toEqual({
      samples: 4,
      durationMs: 0,
      rms: 0.707096,
      peak: 1,
      meanAbs: 0.499992,
      zeroCrossingRate: 0.25,
    });
  });
});
