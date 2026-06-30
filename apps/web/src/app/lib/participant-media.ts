"use client";

import type { Participant } from "./types";

type ParticipantVideoState = Pick<
  Participant,
  "videoStream" | "isCameraOff" | "isVideoAdaptivelyPaused"
> & {
  screenShareStream?: MediaStream | null;
};

export function getRenderableParticipantVideoStream(
  participant: ParticipantVideoState,
): MediaStream | null {
  if (participant.isCameraOff) {
    return null;
  }
  return participant.videoStream;
}

export function hasRenderableParticipantVideo(
  participant: ParticipantVideoState,
): boolean {
  const track = getRenderableParticipantVideoStream(participant)
    ?.getVideoTracks()[0];
  return Boolean(track && track.readyState === "live");
}

export function isRenderingParticipantScreenShare(
  participant: ParticipantVideoState,
  stream: MediaStream | null,
): boolean {
  return Boolean(stream && participant.screenShareStream === stream);
}
