import type {
  TranscriptMinutesEntry,
  TranscriptMinutesSnapshot,
  TranscriptSegment,
} from "@conclave/meeting-core/transcript-types";
import { DEFAULT_QA_MODEL } from "./constants";
import { hashCode, safeJsonParse, toStringValue, trimText } from "./utils";

export const createEmptyMinutes = (
  model = DEFAULT_QA_MODEL,
): TranscriptMinutesSnapshot => ({
  summary: "",
  topics: [],
  decisions: [],
  actionItems: [],
  openQuestions: [],
  followUps: [],
  updatedAt: Date.now(),
  model,
});

const entry = (text: string, index: number): TranscriptMinutesEntry => ({
  id: `m-${index}-${Math.abs(hashCode(text))}`,
  text,
});

export const fallbackMinutes = (
  segments: TranscriptSegment[],
  model: string,
): TranscriptMinutesSnapshot => {
  const finalText = segments
    .filter((segment) => segment.isFinal)
    .map(
      (segment) =>
        `${segment.speakerDisplayName}: ${trimText(segment.text, 500)}`,
    )
    .join("\n");
  const sentences = finalText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => trimText(sentence, 180))
    .filter(Boolean);
  const decisions = sentences.filter((sentence) =>
    /\b(decided|decision|agreed|approved|chosen|confirmed)\b/i.test(sentence),
  );
  const actionItems = sentences.filter((sentence) =>
    /\b(action|todo|follow up|follow-up|owner|will|needs to|next)\b/i.test(
      sentence,
    ),
  );
  const openQuestions = sentences.filter((sentence) => sentence.endsWith("?"));

  return {
    summary: trimText(sentences.slice(-4).join(" "), 900),
    topics: sentences.slice(-8, -3).map(entry),
    decisions: decisions.slice(-8).map(entry),
    actionItems: actionItems.slice(-10).map(entry),
    openQuestions: openQuestions.slice(-8).map(entry),
    followUps: actionItems.slice(-6).map(entry),
    updatedAt: Date.now(),
    model,
  };
};

export const parseMinutesFromText = (
  value: string,
  fallback: TranscriptMinutesSnapshot,
): TranscriptMinutesSnapshot => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return fallback;
  const parsed = safeJsonParse(value.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object") return fallback;
  const data = parsed as Record<string, unknown>;
  const normalizeEntries = (key: string): TranscriptMinutesEntry[] =>
    (Array.isArray(data[key]) ? data[key] : [])
      .map((item, index) => {
        if (typeof item === "string") return entry(trimText(item, 240), index);
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const text = trimText(toStringValue(record.text), 280);
        if (!text) return null;
        return {
          id: toStringValue(record.id) || `${key}-${index}-${hashCode(text)}`,
          text,
          owner: toStringValue(record.owner) || undefined,
          due: toStringValue(record.due) || undefined,
        } satisfies TranscriptMinutesEntry;
      })
      .filter((item): item is TranscriptMinutesEntry => Boolean(item));

  return {
    summary: trimText(toStringValue(data.summary, fallback.summary), 1200),
    topics: normalizeEntries("topics"),
    decisions: normalizeEntries("decisions"),
    actionItems: normalizeEntries("actionItems"),
    openQuestions: normalizeEntries("openQuestions"),
    followUps: normalizeEntries("followUps"),
    updatedAt: Date.now(),
    model: fallback.model,
  };
};

const minutesSectionKeys = [
  "topics",
  "decisions",
  "actionItems",
  "openQuestions",
  "followUps",
] as const;

type MinutesSectionKey = (typeof minutesSectionKeys)[number];

const normalizeUpdateEntries = (
  value: unknown,
  key: MinutesSectionKey,
): TranscriptMinutesEntry[] =>
  (Array.isArray(value) ? value : [])
    .map<TranscriptMinutesEntry | null>((item, index) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = trimText(toStringValue(record.text), 280);
      if (!text) return null;
      return {
        id:
          toStringValue(record.id) ||
          `${key}-${index}-${Math.abs(hashCode(text))}`,
        text,
        owner: toStringValue(record.owner) || undefined,
        due: toStringValue(record.due) || undefined,
      } satisfies TranscriptMinutesEntry;
    })
    .filter((item): item is TranscriptMinutesEntry => Boolean(item));

const applySectionUpdate = (
  current: TranscriptMinutesEntry[],
  value: unknown,
  key: MinutesSectionKey,
): TranscriptMinutesEntry[] => {
  if (!value || typeof value !== "object") return current;
  const update = value as Record<string, unknown>;
  const removeIds = new Set(
    (Array.isArray(update.remove) ? update.remove : [])
      .map((id) => toStringValue(id))
      .filter(Boolean),
  );
  const result = current.filter((item) => !removeIds.has(item.id));
  const indexById = new Map(result.map((item, index) => [item.id, index]));

  for (const item of normalizeUpdateEntries(update.upsert, key)) {
    const existingIndex = indexById.get(item.id);
    if (existingIndex === undefined) {
      indexById.set(item.id, result.length);
      result.push(item);
    } else {
      result[existingIndex] = item;
    }
  }

  return result;
};

/**
 * Applies the model's incremental minutes update to the accumulated snapshot.
 * An omitted item is deliberately retained; the model must name an existing ID
 * in `remove` when recent transcript evidence resolves or invalidates it.
 */
export const applyMinutesUpdateFromText = (
  value: string,
  current: TranscriptMinutesSnapshot,
  fallback: TranscriptMinutesSnapshot = current,
): TranscriptMinutesSnapshot => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return fallback;
  const parsed = safeJsonParse(value.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object") return fallback;
  const data = parsed as Record<string, unknown>;
  const summary = trimText(toStringValue(data.summary), 1200);

  return {
    summary: summary || current.summary,
    topics: applySectionUpdate(current.topics, data.topics, "topics"),
    decisions: applySectionUpdate(
      current.decisions,
      data.decisions,
      "decisions",
    ),
    actionItems: applySectionUpdate(
      current.actionItems,
      data.actionItems,
      "actionItems",
    ),
    openQuestions: applySectionUpdate(
      current.openQuestions,
      data.openQuestions,
      "openQuestions",
    ),
    followUps: applySectionUpdate(
      current.followUps,
      data.followUps,
      "followUps",
    ),
    updatedAt: Date.now(),
    model: current.model,
  };
};
