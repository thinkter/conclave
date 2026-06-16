"use client";

import Image from "next/image";
import { memo } from "react";

interface MeetsHeaderProps {
  isJoined: boolean;
  isAdmin: boolean;
  roomId: string;
  isMirrorCamera: boolean;
  isVideoSettingsOpen: boolean;
  onToggleVideoSettings: () => void;
  onToggleMirror: () => void;
  isCameraOff: boolean;
  displayNameInput: string;
  displayNameStatus: { type: "success" | "error"; message: string } | null;
  isDisplayNameUpdating: boolean;
  canUpdateDisplayName: boolean;
  onDisplayNameInputChange: (value: string) => void;
  onDisplayNameSubmit: () => void;
  selectedAudioInputDeviceId?: string;
  selectedAudioOutputDeviceId?: string;
  selectedVideoInputDeviceId?: string;
  onAudioInputDeviceChange: (deviceId: string) => void;
  onAudioOutputDeviceChange: (deviceId: string) => void;
  onVideoInputDeviceChange: (deviceId: string) => void;
  showShareLink?: boolean;
  canSignOut: boolean;
  isSigningOut: boolean;
  onSignOut: () => void;
}

function MeetsHeader({ isJoined }: MeetsHeaderProps) {
  if (isJoined) {
    return null;
  }

  // Pre-join: a single quiet brand mark, top-left. Account actions live on the
  // JoinScreen preview tile, so the frame stays clean (no leetspeak wordmark,
  // no duplicate sign-out, no uppercase tracking).
  return (
    <header className="fixed left-0 right-0 top-0 z-[100] pointer-events-none">
      <div className="flex items-center px-5 py-4 pointer-events-auto">
        <a href="/" className="flex items-center" aria-label="ACM-VIT home">
          <Image
            src="/assets/acm_topleft.svg"
            alt="ACM-VIT"
            width={128}
            height={128}
            className="h-auto w-[104px]"
            priority
          />
        </a>
      </div>
    </header>
  );
}

export default memo(MeetsHeader);
