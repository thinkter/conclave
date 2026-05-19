"use client";

import { createBlurredTrack } from "./filters/blur";
import { createFaceOverlayTrack } from "./filters/face-2d";
import {
  createThreeFaceOverlayTrack,
  isThreeFaceEffect,
} from "./filters/glasses-3d";
import { getVideoConstraints, stopMediaStream } from "./media";
import type {
  CreateManagedCameraTrackFromTrackOptions,
  CreateManagedCameraTrackOptions,
  ManagedCameraTrack,
} from "./types";

export {
  BACKGROUND_EFFECT_OPTIONS,
  CAMERA_EFFECT_OPTIONS,
  getBackgroundEffectOption,
  getCameraEffectOption,
} from "./constants";
export type {
  BackgroundEffect,
  BackgroundEffectOption,
  CameraEffect,
  CameraEffectOption,
  ManagedCameraTrack,
} from "./types";

export const createManagedCameraTrack = async ({
  effect,
  quality,
}: CreateManagedCameraTrackOptions): Promise<ManagedCameraTrack> => {
  const sourceStream = await navigator.mediaDevices.getUserMedia({
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

  if (effect === "none") {
    return {
      stream: new MediaStream([sourceTrack]),
      track: sourceTrack,
      stop: () => {
        stopMediaStream(sourceStream);
      },
    };
  }

  try {
    if (effect === "blur") {
      return await createBlurredTrack(sourceStream, sourceTrack);
    }
    if (isThreeFaceEffect(effect)) {
      return await createThreeFaceOverlayTrack(sourceStream, sourceTrack, effect);
    }

    return await createFaceOverlayTrack(sourceStream, sourceTrack, effect);
  } catch (error) {
    console.warn(
      `[Meets] ${effect} camera effect setup failed, falling back to raw camera:`,
      error,
    );

    return {
      stream: new MediaStream([sourceTrack]),
      track: sourceTrack,
      stop: () => {
        stopMediaStream(sourceStream);
      },
    };
  }
};

export const createManagedCameraTrackFromTrack = async ({
  effect,
  sourceTrack,
}: CreateManagedCameraTrackFromTrackOptions): Promise<ManagedCameraTrack> => {
  const clonedTrack = sourceTrack.clone();
  const sourceStream = new MediaStream([clonedTrack]);

  if ("contentHint" in clonedTrack) {
    clonedTrack.contentHint = "motion";
  }

  if (effect === "none") {
    return {
      stream: new MediaStream([clonedTrack]),
      track: clonedTrack,
      stop: () => {
        stopMediaStream(sourceStream);
      },
    };
  }

  try {
    if (effect === "blur") {
      return await createBlurredTrack(sourceStream, clonedTrack);
    }
    if (isThreeFaceEffect(effect)) {
      return await createThreeFaceOverlayTrack(sourceStream, clonedTrack, effect);
    }

    return await createFaceOverlayTrack(sourceStream, clonedTrack, effect);
  } catch (error) {
    console.warn(
      `[Meets] ${effect} camera effect preview setup failed, falling back to cloned camera:`,
      error,
    );

    return {
      stream: new MediaStream([clonedTrack]),
      track: clonedTrack,
      stop: () => {
        stopMediaStream(sourceStream);
      },
    };
  }
};
