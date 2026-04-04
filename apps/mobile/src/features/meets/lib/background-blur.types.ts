import type { VideoQuality } from "../types";

export type BackgroundEffect = "none" | "blur";

export interface ManagedCameraTrack {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
}

export interface CreateManagedCameraTrackOptions {
  effect: BackgroundEffect;
  quality: VideoQuality;
  getUserMedia: (
    constraints:
      | Parameters<MediaDevices["getUserMedia"]>[0]
      | MediaStreamConstraints,
  ) => Promise<MediaStream>;
}
