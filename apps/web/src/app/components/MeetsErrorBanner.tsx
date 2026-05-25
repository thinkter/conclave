"use client";

import { AlertCircle, X } from "lucide-react";
import type { MeetError } from "../lib/types";

interface MeetsErrorBannerProps {
  meetError: MeetError;
  onDismiss: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

export default function MeetsErrorBanner({
  meetError,
  onDismiss,
  primaryActionLabel,
  onPrimaryAction,
}: MeetsErrorBannerProps) {
  const isGuestBlockedError =
    meetError.message === "Guests are not allowed in this meeting.";
  const helperText =
    isGuestBlockedError
      ? "This room only allows signed-in users. Sign in with an account to join."
      : meetError.code === "PERMISSION_DENIED"
      ? "Check browser permissions, then try again."
      : meetError.code === "MEDIA_ERROR"
      ? "Make sure your camera/mic are available."
      : null;
  return (
    <div
      className="px-6 py-4 bg-[#5B7CFA]/10 border-b border-[#5B7CFA]/30 flex items-center justify-between backdrop-blur-sm"
      style={{ fontFamily: "'PolySans Trial', sans-serif" }}
    >
      <div className="flex items-start gap-3 text-[#5B7CFA]">
        <div className="p-1.5 rounded-full bg-[#5B7CFA]/20">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm">{meetError.message}</span>
          {helperText && (
            <span className="text-[11px] text-[#FEFCD9]/60">{helperText}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {primaryActionLabel && onPrimaryAction && (
          <button
            onClick={onPrimaryAction}
            className="px-3 py-1.5 rounded-full bg-[#5B7CFA]/15 text-[#5B7CFA] text-xs font-medium hover:bg-[#5B7CFA]/25 transition-colors"
            style={{ fontFamily: "'PolySans Trial', sans-serif" }}
          >
            {primaryActionLabel}
          </button>
        )}
        <button
          onClick={onDismiss}
          className="acm-control-btn !w-8 !h-8 !bg-[#5B7CFA]/10 !border-[#5B7CFA]/30 !text-[#5B7CFA]"
          title="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
