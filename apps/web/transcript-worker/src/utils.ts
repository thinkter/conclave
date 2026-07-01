import type {
  TranscriptAudioSource,
  TranscriptSpeaker,
  TranscriptTransportMode,
} from "@conclave/meeting-core/transcript-types";
import {
  DEFAULT_LANGUAGE,
  DEFAULT_TRANSCRIPTION_LOCALE,
  DEFAULT_TRANSCRIPTION_DELAY,
} from "./constants";

export const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers ?? {}),
    },
  });

export const normalizeRoomIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/rooms\/([^/]+)\/ws$/);
  return match ? decodeURIComponent(match[1] || "") : null;
};

export const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const toStringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

export const normalizeModel = (value: unknown, fallback: string): string => {
  const candidate = toStringValue(value).trim();
  if (!candidate || candidate.length > 120) return fallback;
  if (!/^[a-zA-Z0-9._:-]+$/.test(candidate)) return fallback;
  return candidate;
};

export const normalizeDelay = (value: unknown): string => {
  const candidate = toStringValue(value, DEFAULT_TRANSCRIPTION_DELAY).trim();
  return ["minimal", "low", "medium", "high", "xhigh"].includes(candidate)
    ? candidate
    : DEFAULT_TRANSCRIPTION_DELAY;
};

export const normalizeLanguage = (value: unknown): string => {
  const candidate = toStringValue(value, DEFAULT_LANGUAGE).trim();
  return /^[a-zA-Z-]{2,12}$/.test(candidate) ? candidate : DEFAULT_LANGUAGE;
};

export const normalizeLocale = (value: unknown): string => {
  const candidate = toStringValue(value, DEFAULT_TRANSCRIPTION_LOCALE).trim();
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8}){0,2}$/.test(candidate)
    ? candidate
    : DEFAULT_TRANSCRIPTION_LOCALE;
};

export const normalizeTransportMode = (
  value: unknown,
): TranscriptTransportMode => (value === "sfu" ? "sfu" : "browser");

export const normalizeSpeaker = (
  value: Partial<TranscriptSpeaker> | undefined,
  fallback: Pick<TranscriptSpeaker, "userId" | "displayName">,
): TranscriptSpeaker => {
  const source = value?.source;
  const normalizedSource: TranscriptAudioSource =
    source === "local" ||
    source === "remote" ||
    source === "screen" ||
    source === "mixed" ||
    source === "unknown"
      ? source
      : "mixed";
  const userId = toStringValue(value?.userId, fallback.userId).slice(0, 256);
  const displayName = toStringValue(
    value?.displayName,
    fallback.displayName,
  ).slice(0, 160);
  return {
    userId: userId || fallback.userId,
    displayName: displayName || fallback.displayName,
    source: normalizedSource,
  };
};

export const trimText = (value: string, maxLength: number): string =>
  value.replace(/\s+/g, " ").trim().slice(0, maxLength);

export const estimatePcm16Base64SampleCount = (value: string): number => {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const byteLength = Math.max(
    0,
    Math.floor((normalized.length * 3) / 4) - padding,
  );
  return Math.floor(byteLength / 2);
};

export const analyzePcm16Base64 = (
  value: string,
  sampleRate: number,
): Record<string, number> => {
  const binary = atob(value.replace(/\s+/g, ""));
  const samples = Math.floor(binary.length / 2);
  if (samples === 0) {
    return {
      samples: 0,
      durationMs: 0,
      rms: 0,
      peak: 0,
      meanAbs: 0,
      zeroCrossingRate: 0,
    };
  }

  let sumSquares = 0;
  let sumAbs = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let previousSign = 0;
  for (let index = 0; index < samples; index += 1) {
    const offset = index * 2;
    const unsigned =
      (binary.charCodeAt(offset) & 0xff) |
      ((binary.charCodeAt(offset + 1) & 0xff) << 8);
    const sample = unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
    const normalized = sample / 32768;
    const abs = Math.abs(normalized);
    sumSquares += normalized * normalized;
    sumAbs += abs;
    peak = Math.max(peak, abs);
    const sign = sample === 0 ? previousSign : sample > 0 ? 1 : -1;
    if (previousSign !== 0 && sign !== 0 && sign !== previousSign) {
      zeroCrossings += 1;
    }
    previousSign = sign;
  }

  return {
    samples,
    durationMs: Math.round((samples / sampleRate) * 1000),
    rms: Number(Math.sqrt(sumSquares / samples).toFixed(6)),
    peak: Number(peak.toFixed(6)),
    meanAbs: Number((sumAbs / samples).toFixed(6)),
    zeroCrossingRate: Number((zeroCrossings / samples).toFixed(6)),
  };
};

export const createSilentPcm16Base64 = (samples: number): string => {
  const sampleCount = Math.max(0, Math.floor(samples));
  if (sampleCount === 0) return "";
  return btoa("\0".repeat(sampleCount * 2));
};

export const redactSensitiveText = (value: string): string =>
  value.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-...[redacted]");

export const hashCode = (value: string): number => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
};
