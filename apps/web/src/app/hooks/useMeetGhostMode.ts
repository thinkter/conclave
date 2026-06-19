"use client";

import { useEffect } from "react";

interface UseMeetGhostModeOptions {
  canUseGhostMode: boolean;
  isGhostMode: boolean;
  setIsGhostMode: (value: boolean) => void;
  ghostEnabled: boolean;
  setIsMuted: (value: boolean) => void;
  setIsCameraOff: (value: boolean) => void;
  setIsScreenSharing: (value: boolean) => void;
  setIsHandRaised: (value: boolean) => void;
}

export function useMeetGhostMode({
  canUseGhostMode,
  isGhostMode,
  setIsGhostMode,
  ghostEnabled,
  setIsMuted,
  setIsCameraOff,
  setIsScreenSharing,
  setIsHandRaised,
}: UseMeetGhostModeOptions) {
  useEffect(() => {
    if (!canUseGhostMode && isGhostMode) {
      setIsGhostMode(false);
    }
  }, [canUseGhostMode, isGhostMode, setIsGhostMode]);

  useEffect(() => {
    if (!ghostEnabled) return;
    setIsMuted(true);
    setIsCameraOff(true);
    setIsScreenSharing(false);
    setIsHandRaised(false);
  }, [
    ghostEnabled,
    setIsMuted,
    setIsCameraOff,
    setIsScreenSharing,
    setIsHandRaised,
  ]);
}
