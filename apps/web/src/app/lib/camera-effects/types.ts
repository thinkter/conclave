"use client";

import type { VideoQuality } from "../types";

export type CameraEffect =
  | "none"
  | "blur"
  | "party-hat"
  | "cat-ears"
  | "3d-glasses";

export type BackgroundEffect = CameraEffect;

export interface CameraEffectOption {
  id: CameraEffect;
  label: string;
  description: string;
  category: "background" | "face";
  experimental?: boolean;
}

export type BackgroundEffectOption = CameraEffectOption;

export interface ManagedCameraTrack {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
}

export interface CreateManagedCameraTrackOptions {
  effect: CameraEffect;
  quality: VideoQuality;
}

export interface CreateManagedCameraTrackFromTrackOptions {
  effect: CameraEffect;
  sourceTrack: MediaStreamTrack;
}

export type Landmark = { x: number; y: number; z?: number };

