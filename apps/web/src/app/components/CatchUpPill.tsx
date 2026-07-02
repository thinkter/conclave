"use client";

import { X } from "lucide-react";
import { useCallback, useState } from "react";

/**
 * A quiet, dismissible chip for late joiners while the meeting assistant is
 * live: one tap opens the transcript panel on the minutes tab, which already
 * holds a self-updating summary of everything they missed.
 *
 * Deliberately gated so it never nags: it only exists when a transcript
 * session is running (the assistant is strictly opt-in per meeting), only for
 * people who joined meaningfully after it started, and once dismissed it stays
 * gone for that session.
 */

const MIN_MISSED_MS = 2 * 60 * 1000;

const dismissalKey = (sessionKey: string): string =>
  `conclave.catchup.dismissed.${sessionKey}`;

const readDismissed = (sessionKey: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(dismissalKey(sessionKey)) === "1";
  } catch {
    return false;
  }
};

const writeDismissed = (sessionKey: string): void => {
  try {
    window.sessionStorage.setItem(dismissalKey(sessionKey), "1");
  } catch {
    // Storage unavailable; the in-memory state still hides the pill.
  }
};

interface CatchUpPillProps {
  /** When the live transcript session started (server clock, ms epoch). */
  startedAt: number | null;
  /** When this participant joined the call (local clock, ms epoch). */
  joinedAt: number | null;
  /** Stable key for this transcript session, used for the dismissal memory. */
  sessionKey: string;
  /** Opens the transcript panel on the minutes tab. */
  onOpen: () => void;
}

export default function CatchUpPill({
  startedAt,
  joinedAt,
  sessionKey,
  onOpen,
}: CatchUpPillProps) {
  const [dismissed, setDismissed] = useState(() => readDismissed(sessionKey));

  const dismiss = useCallback(() => {
    setDismissed(true);
    writeDismissed(sessionKey);
  }, [sessionKey]);

  const open = useCallback(() => {
    dismiss();
    onOpen();
  }, [dismiss, onOpen]);

  if (dismissed || startedAt == null || joinedAt == null) return null;
  const missedMs = joinedAt - startedAt;
  if (missedMs < MIN_MISSED_MS) return null;

  const missedMinutes = Math.max(2, Math.round(missedMs / 60_000));

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4">
      <div
        className="pointer-events-auto flex max-w-[min(30rem,calc(100vw-2rem))] items-center gap-1 rounded-full border border-[#fafafa]/10 bg-[#0a0a0b]/85 p-1 shadow-[0_14px_42px_rgba(0,0,0,0.32)] backdrop-blur-md"
        style={{ fontFamily: "'PolySans Trial', sans-serif" }}
        role="status"
      >
        <button
          type="button"
          onClick={open}
          className="flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-[#fafafa] transition-colors hover:bg-white/[0.06]"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#F95F4A]" />
          <span className="truncate">
            Catch up on the last {missedMinutes} min
          </span>
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss catch up"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#fafafa]/55 transition-colors hover:bg-white/[0.06] hover:text-[#fafafa]"
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
