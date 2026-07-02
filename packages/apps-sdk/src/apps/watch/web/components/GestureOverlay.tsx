import React from "react";
import type { GestureNeed } from "../hooks/useSyncedPlayback";
import { thumbnailUrl } from "../youtubeMeta";

type GestureOverlayProps = {
  need: GestureNeed;
  onResolve: () => void;
  /** The current video, shown as a dimmed poster so the tap has context. */
  videoId: string | null;
  title: string | null;
};

/**
 * Autoplay gesture overlay. Instead of a bare button in a void, the video's
 * own thumbnail sits dimmed behind the prompt with its title, so joining
 * reads as "join this". One solid coral pill, no animation.
 */
export function GestureOverlay({
  need,
  onResolve,
  videoId,
  title,
}: GestureOverlayProps) {
  if (need === "none") return null;
  const label = need === "sound" ? "Join with sound" : "Tap to sync";
  const sub =
    need === "sound"
      ? "You are watching muted until you join."
      : "Your browser needs a tap before playback can start.";

  return (
    <div className="absolute inset-0 z-20 overflow-hidden">
      {videoId ? (
        <img
          src={thumbnailUrl(videoId)}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
      ) : null}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.74)" }}
      />

      <div className="relative flex h-full w-full items-center justify-center p-6">
        <div className="flex w-full max-w-sm flex-col items-center text-center">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-[#a1a1aa]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "#F95F4A" }}
            />
            Playing for the room
          </p>
          {title ? (
            <p
              className="mt-2 text-[15px] font-medium leading-snug text-[#fafafa]"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {title}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onResolve}
            className="mt-5 inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-full px-6 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#F95F4A" }}
          >
            {need === "sound" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
            )}
            {label}
          </button>
          <p className="mt-3 max-w-[16rem] text-[12px] leading-relaxed text-[#a1a1aa]">
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}
