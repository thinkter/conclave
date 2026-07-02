// YouTube video ids are exactly 11 chars from [A-Za-z0-9_-].
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** True if the string is a bare, valid 11-char YouTube video id. */
export const isValidVideoId = (value: string): boolean =>
  VIDEO_ID_PATTERN.test(value);

/**
 * Extract an 11-char YouTube video id from user input. Accepts:
 * - a bare id (`dQw4w9WgXcQ`)
 * - `youtube.com/watch?v=<id>` (with any extra query params)
 * - `youtu.be/<id>`
 * - `youtube.com/shorts/<id>`
 * - `youtube.com/embed/<id>` and `youtube.com/live/<id>`
 * Returns null when nothing valid is found, so the caller can reject inline.
 */
export const parseVideoId = (raw: string): string | null => {
  const input = raw.trim();
  if (!input) return null;

  // Bare id pasted directly.
  if (isValidVideoId(input)) {
    return input;
  }

  const url = safeParseUrl(input);
  if (!url) {
    // Not a URL and not a bare id: try a loose `v=` match as a last resort.
    const looseMatch = input.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    return looseMatch ? looseMatch[1] : null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return isValidVideoId(id) ? id : null;
  }

  const isYouTubeHost =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host.endsWith(".youtube.com");
  if (!isYouTubeHost) {
    return null;
  }

  // youtube.com/watch?v=<id>
  const vParam = url.searchParams.get("v");
  if (vParam && isValidVideoId(vParam)) {
    return vParam;
  }

  // Path-based forms: /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>.
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length >= 2) {
    const [prefix, candidate] = segments;
    if (
      (prefix === "shorts" ||
        prefix === "embed" ||
        prefix === "live" ||
        prefix === "v") &&
      isValidVideoId(candidate)
    ) {
      return candidate;
    }
  }

  return null;
};

const safeParseUrl = (value: string): URL | null => {
  const withScheme = /^[a-z]+:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
};
