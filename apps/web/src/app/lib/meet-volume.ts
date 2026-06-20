export const DEFAULT_MEET_VOLUME = 1;

export const clampMeetVolume = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_MEET_VOLUME;
  return Math.min(1, Math.max(0, value));
};
