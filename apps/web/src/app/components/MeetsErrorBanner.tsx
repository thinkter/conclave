"use client";

import { AlertCircle, X } from "lucide-react";
import type { MeetError } from "../lib/types";

interface MeetsErrorBannerProps {
  meetError: MeetError;
  onDismiss: () => void;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  variant?: "strip" | "inline";
}

export default function MeetsErrorBanner({
  meetError,
  onDismiss,
  primaryActionLabel,
  onPrimaryAction,
  variant = "strip",
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
  const shellClass =
    variant === "inline"
      ? "w-full min-w-0 rounded-xl border border-[#F95F4A]/25 bg-[#F95F4A]/10 px-4 py-3 flex items-start justify-between gap-3 backdrop-blur-sm"
      : "w-full min-w-0 px-6 py-4 bg-[#F95F4A]/10 border-b border-[#F95F4A]/30 flex items-start justify-between gap-4 backdrop-blur-sm";

  return (
    <div
      className={shellClass}
      style={{ fontFamily: "'PolySans Trial', sans-serif" }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 text-[#F95F4A]">
        <div className="shrink-0 p-1.5 rounded-full bg-[#F95F4A]/20">
          <AlertCircle className="w-4 h-4" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="break-words text-sm leading-5">
            {meetError.message}
          </span>
          {helperText && (
            <span className="break-words text-[11px] leading-4 text-[#fafafa]/75">
              {helperText}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {primaryActionLabel && onPrimaryAction && (
          <button
            onClick={onPrimaryAction}
            className="px-3 py-1.5 rounded-full bg-[#F95F4A]/15 text-[#F95F4A] text-xs font-medium hover:bg-[#F95F4A]/25 transition-colors"
            style={{ fontFamily: "'PolySans Trial', sans-serif" }}
          >
            {primaryActionLabel}
          </button>
        )}
        <button
          onClick={onDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#F95F4A]/30 bg-[#F95F4A]/10 text-[#F95F4A] transition-colors hover:bg-[#F95F4A]/20"
          title="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
