import { NextResponse } from "next/server";
import type {
  KlipyGifResult,
  KlipyGifSearchResponse,
} from "../../../lib/klipy-gifs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KLIPY_API_BASE_URL = "https://api.klipy.com/api/v1";
const KLIPY_MEDIA_HOST = "static.klipy.com";
const DEFAULT_PER_PAGE = 16;
const MAX_PER_PAGE = 32;
const MAX_QUERY_LENGTH = 80;
const RATING = "pg";
const GIF_SIZE_PREFERENCE = ["md", "sm", "hd", "xs"] as const;
const PREVIEW_SIZE_PREFERENCE = ["sm", "xs", "md", "hd"] as const;
const GIF_FORMAT_PREFERENCE = ["gif"] as const;
const PREVIEW_FORMAT_PREFERENCE = ["webp", "gif", "jpg"] as const;

interface KlipyRendition {
  url: string;
  width?: number;
  height?: number;
}

const clampInteger = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const asDimension = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded > 0 && rounded <= 4096 ? rounded : undefined;
};

const normalizeKlipyMediaUrl = (value: unknown): string | null => {
  const raw = asString(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== KLIPY_MEDIA_HOST) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
};

const findRendition = (
  file: unknown,
  sizes: readonly string[],
  formats: readonly string[],
): KlipyRendition | null => {
  const fileRecord = asRecord(file);
  if (!fileRecord) return null;

  for (const size of sizes) {
    const sizeRecord = asRecord(fileRecord[size]);
    if (!sizeRecord) continue;

    for (const format of formats) {
      const renditionRecord = asRecord(sizeRecord[format]);
      if (!renditionRecord) continue;

      const url = normalizeKlipyMediaUrl(renditionRecord.url);
      if (!url) continue;

      return {
        url,
        width: asDimension(renditionRecord.width),
        height: asDimension(renditionRecord.height),
      };
    }
  }

  return null;
};

const normalizeKlipyGif = (value: unknown): KlipyGifResult | null => {
  const item = asRecord(value);
  if (!item) return null;

  const gif = findRendition(
    item.file,
    GIF_SIZE_PREFERENCE,
    GIF_FORMAT_PREFERENCE,
  );
  const preview = findRendition(
    item.file,
    PREVIEW_SIZE_PREFERENCE,
    PREVIEW_FORMAT_PREFERENCE,
  );
  if (!gif) return null;

  const rawId = asString(item.slug) ?? asString(item.id) ?? gif.url;
  const title = (asString(item.title) ?? "GIF").slice(0, 140);
  const slug = asString(item.slug);

  return {
    id: rawId.slice(0, 120),
    title,
    url: gif.url,
    previewUrl: preview?.url ?? gif.url,
    ...(slug ? { pageUrl: `https://klipy.com/gifs/${encodeURIComponent(slug)}` } : {}),
    ...(gif.width ?? preview?.width ? { width: gif.width ?? preview?.width } : {}),
    ...(gif.height ?? preview?.height
      ? { height: gif.height ?? preview?.height }
      : {}),
    source: "klipy",
  };
};

export async function GET(request: Request) {
  const apiKey = process.env.KLIPY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Klipy API key is not configured" },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? searchParams.get("query") ?? "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const page = clampInteger(searchParams.get("page"), 1, 1, 50);
  const perPage = clampInteger(
    searchParams.get("per_page") ?? searchParams.get("limit"),
    DEFAULT_PER_PAGE,
    8,
    MAX_PER_PAGE,
  );

  const endpoint = query ? "search" : "trending";
  const url = new URL(
    `${KLIPY_API_BASE_URL}/${encodeURIComponent(apiKey)}/gifs/${endpoint}`,
  );
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("rating", RATING);
  if (query) {
    url.searchParams.set("q", query);
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Klipy request failed" },
      { status: 502 },
    );
  }

  const body = await response.json();
  const data = asRecord(asRecord(body)?.data);
  const rawItems = Array.isArray(data?.data) ? data.data : [];
  const gifs = rawItems
    .map((item) => normalizeKlipyGif(item))
    .filter((item): item is KlipyGifResult => Boolean(item));

  const payload: KlipyGifSearchResponse = {
    gifs,
    page: typeof data?.current_page === "number" ? data.current_page : page,
    hasNext: data?.has_next === true,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
