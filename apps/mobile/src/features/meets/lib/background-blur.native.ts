import {
  LOW_QUALITY_CONSTRAINTS,
  STANDARD_QUALITY_CONSTRAINTS,
} from "../constants";
import type {
  CreateManagedCameraTrackOptions,
  ManagedCameraTrack,
} from "./background-blur.types";

const getVideoConstraints = (quality: CreateManagedCameraTrackOptions["quality"]) =>
  quality === "low"
    ? { ...LOW_QUALITY_CONSTRAINTS }
    : { ...STANDARD_QUALITY_CONSTRAINTS };

const stopMediaStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    track.onended = null;
    try {
      track.stop();
    } catch {}
  });
};

export const createManagedCameraTrack = async ({
  quality,
  getUserMedia,
}: CreateManagedCameraTrackOptions): Promise<ManagedCameraTrack> => {
  const sourceStream = await getUserMedia({
    video: getVideoConstraints(quality),
  });
  const sourceTrack = sourceStream.getVideoTracks()[0];

  if (!sourceTrack) {
    stopMediaStream(sourceStream);
    throw new Error("No video track obtained");
  }

  if ("contentHint" in sourceTrack) {
    sourceTrack.contentHint = "motion";
  }

  return {
    stream: new MediaStream([sourceTrack]),
    track: sourceTrack,
    stop: () => {
      stopMediaStream(sourceStream);
    },
  };
};

export type { BackgroundEffect, ManagedCameraTrack } from "./background-blur.types";
