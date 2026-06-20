import type { ChatGifAttachment } from "./types";

export interface KlipyGifResult extends ChatGifAttachment {
  previewUrl: string;
}

export interface KlipyGifSearchResponse {
  gifs: KlipyGifResult[];
  page: number;
  hasNext: boolean;
}

export const klipyGifResultToAttachment = (
  gif: KlipyGifResult,
): ChatGifAttachment => ({
  id: gif.id,
  title: gif.title,
  url: gif.url,
  previewUrl: gif.previewUrl,
  pageUrl: gif.pageUrl,
  width: gif.width,
  height: gif.height,
  source: "klipy",
});
