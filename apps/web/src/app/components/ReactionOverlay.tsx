"use client";

import { memo, useSyncExternalStore } from "react";
import type { ReactionStore } from "../lib/reaction-store";

interface ReactionOverlayProps {
  store: ReactionStore;
  getDisplayName: (userId: string) => string;
}

function ReactionOverlay({ store, getDisplayName }: ReactionOverlayProps) {
  // Subscribing here (instead of receiving reactions as a prop) keeps
  // reaction traffic from re-rendering anything above this overlay.
  const reactions = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  if (reactions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {reactions.map((reaction) => {
        const displayName = getDisplayName(reaction.userId);
        return (
          <div
            key={reaction.id}
            className="absolute bottom-24 sm:bottom-20"
            style={{ left: `${reaction.lane}%` }}
          >
            <div className="-translate-x-1/2">
              <div
                className="animate-reaction-float flex flex-col items-center gap-1.5"
                style={{ animationDuration: "2s" }}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#fafafa]/10 bg-[#18181b]/90 text-2xl sm:h-14 sm:w-14 sm:text-3xl">
                  {reaction.kind === "emoji" ? (
                    reaction.value
                  ) : (
                    <img
                      src={reaction.value}
                      alt={reaction.label || "Reaction"}
                      className="h-6 w-6 object-contain sm:h-8 sm:w-8"
                    />
                  )}
                </div>
                <span className="max-w-[140px] truncate rounded-full border border-[#fafafa]/10 bg-[#18181b]/90 px-2 py-0.5 text-[11px] text-[#fafafa]/70 sm:text-[12px]">
                  {displayName}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(ReactionOverlay);
