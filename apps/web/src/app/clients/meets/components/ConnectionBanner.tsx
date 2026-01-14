"use client";

import { RefreshCw, WifiOff } from "lucide-react";
import type { ConnectionState } from "../types";

interface ConnectionBannerProps {
  state: ConnectionState;
  compact?: boolean;
}

export default function ConnectionBanner({
  state,
  compact = false,
}: ConnectionBannerProps) {
  if (!["reconnecting", "disconnected", "error"].includes(state)) return null;

  const isReconnecting = state === "reconnecting";
  const message = isReconnecting
    ? "Reconnecting… we’ll keep trying."
    : "Connection lost. Refresh to rejoin.";

  const handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 z-40 rounded-full border border-[#FEFCD9]/10 bg-black/70 backdrop-blur-md px-4 py-2 ${
        compact ? "top-3" : "top-4"
      }`}
      style={{ fontFamily: "'PolySans Trial', sans-serif" }}
    >
      <div className="flex items-center gap-3 text-[#FEFCD9]/80">
        {isReconnecting ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#F95F4A]" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-[#F95F4A]" />
        )}
        <span className={`${compact ? "text-[11px]" : "text-xs"}`}>
          {message}
        </span>
        {!isReconnecting && (
          <button
            onClick={handleReload}
            className="ml-1 text-[10px] uppercase tracking-widest text-[#F95F4A] hover:text-[#f97b6a] transition-colors"
            style={{ fontFamily: "'PolySans Mono', monospace" }}
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
