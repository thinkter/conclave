"use client";

import {
  LOW_QUALITY_CONSTRAINTS,
  STANDARD_QUALITY_CONSTRAINTS,
} from "./constants";
import type { VideoQuality } from "./types";

export type CameraEffect =
  | "none"
  | "blur"
  | "party-hat"
  | "cat-ears";

export type BackgroundEffect = CameraEffect;

export interface CameraEffectOption {
  id: CameraEffect;
  label: string;
  description: string;
  category: "background" | "face";
  experimental?: boolean;
}

export type BackgroundEffectOption = CameraEffectOption;

export const CAMERA_EFFECT_OPTIONS: CameraEffectOption[] = [
  {
    id: "none",
    label: "Original",
    description: "Raw camera feed",
    category: "background",
  },
  {
    id: "blur",
    label: "Blur",
    description: "Soft background blur",
    category: "background",
  },
  {
    id: "party-hat",
    label: "Party Hat",
    description: "Tiny celebration hat",
    category: "face",
  },
  {
    id: "cat-ears",
    label: "Cat Ears",
    description: "Pointed ears above your head",
    category: "face",
  },
];

export const BACKGROUND_EFFECT_OPTIONS = CAMERA_EFFECT_OPTIONS;

export const getCameraEffectOption = (effect: CameraEffect) =>
  CAMERA_EFFECT_OPTIONS.find((option) => option.id === effect);

export const getBackgroundEffectOption = getCameraEffectOption;

export interface ManagedCameraTrack {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop: () => void;
}

interface CreateManagedCameraTrackOptions {
  effect: CameraEffect;
  quality: VideoQuality;
}

interface CreateManagedCameraTrackFromTrackOptions {
  effect: CameraEffect;
  sourceTrack: MediaStreamTrack;
}

const MEDIAPIPE_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MEDIAPIPE_SELFIE_SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
const MEDIAPIPE_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const BACKGROUND_BLUR_RADIUS_PX = 18;
const MASK_SOFTEN_RADIUS_PX = 4;
const PERSON_MASK_THRESHOLD = 0.5;
const BLUR_SETUP_TIMEOUT_MS = 2500;
const FACE_FILTER_SETUP_TIMEOUT_MS = 2500;

type SegmenterModule = typeof import("@mediapipe/tasks-vision");
type VisionModule = typeof import("@mediapipe/tasks-vision");
type FaceLandmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
type Landmark = { x: number; y: number; z?: number };

let visionModulePromise: Promise<VisionModule> | null = null;
let segmenterPromise: Promise<import("@mediapipe/tasks-vision").ImageSegmenter> | null =
  null;
let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

const getVideoConstraints = (
  quality: VideoQuality,
): MediaTrackConstraints => {
  return quality === "low"
    ? { ...LOW_QUALITY_CONSTRAINTS }
    : { ...STANDARD_QUALITY_CONSTRAINTS };
};

const loadSegmenterModule = async (): Promise<SegmenterModule> => {
  if (!visionModulePromise) {
    visionModulePromise = import("@mediapipe/tasks-vision");
  }

  return visionModulePromise;
};

const loadVisionModule = loadSegmenterModule;

const getImageSegmenter = async () => {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await loadSegmenterModule();
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

      return ImageSegmenter.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_SELFIE_SEGMENTER_MODEL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: true,
      });
    })();

    segmenterPromise = segmenterPromise.catch((error) => {
      segmenterPromise = null;
      throw error;
    });
  }

  return segmenterPromise;
};

const getImageSegmenterWithTimeout = async () => {
  return Promise.race([
    getImageSegmenter(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Background blur setup timed out"));
      }, BLUR_SETUP_TIMEOUT_MS);
    }),
  ]);
};

const getFaceLandmarker = async () => {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FaceLandmarker, FilesetResolver } = await loadVisionModule();
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_MODEL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    })();

    faceLandmarkerPromise = faceLandmarkerPromise.catch((error) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }

  return faceLandmarkerPromise;
};

const getFaceLandmarkerWithTimeout = async () => {
  return Promise.race([
    getFaceLandmarker(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Face filter setup timed out"));
      }, FACE_FILTER_SETUP_TIMEOUT_MS);
    }),
  ]);
};

const stopMediaStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => {
    track.onended = null;
    try {
      track.stop();
    } catch {}
  });
};

const waitForVideoReady = async (video: HTMLVideoElement): Promise<void> => {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoadedData = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Camera preview failed to start"));
    };
    const cleanup = () => {
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("error", handleError);
    };

    video.addEventListener("loadeddata", handleLoadedData, { once: true });
    video.addEventListener("error", handleError, { once: true });
  });
};

const getLandmarkPoint = (
  landmarks: Landmark[],
  index: number,
  width: number,
  height: number,
) => {
  const landmark = landmarks[index];
  return {
    x: (landmark?.x ?? 0) * width,
    y: (landmark?.y ?? 0) * height,
  };
};

const getAngle = (
  start: { x: number; y: number },
  end: { x: number; y: number },
) => Math.atan2(end.y - start.y, end.x - start.x);

const getDistance = (
  start: { x: number; y: number },
  end: { x: number; y: number },
) => Math.hypot(end.x - start.x, end.y - start.y);

const withFaceTransform = (
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  angle: number,
  draw: () => void,
) => {
  context.save();
  context.translate(center.x, center.y);
  context.rotate(angle);
  draw();
  context.restore();
};

const drawPartyHat = (
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  faceWidth: number,
  angle: number,
) => {
  withFaceTransform(context, center, angle, () => {
    const width = faceWidth * 0.34;
    const height = faceWidth * 0.5;

    context.fillStyle = "#F95F4A";
    context.strokeStyle = "rgba(255,255,255,0.85)";
    context.lineWidth = Math.max(3, faceWidth * 0.018);

    context.beginPath();
    context.moveTo(0, -height);
    context.lineTo(-width * 0.5, 0);
    context.lineTo(width * 0.5, 0);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = "#FEFCD9";
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column <= row; column += 1) {
        const x = (column - row / 2) * width * 0.22;
        const y = -height * (0.25 + row * 0.18);
        context.beginPath();
        context.arc(x, y, Math.max(3, faceWidth * 0.018), 0, Math.PI * 2);
        context.fill();
      }
    }
  });
};

const drawCatEars = (
  context: CanvasRenderingContext2D,
  center: { x: number; y: number },
  faceWidth: number,
  angle: number,
) => {
  withFaceTransform(context, center, angle, () => {
    const earWidth = faceWidth * 0.2;
    const earHeight = faceWidth * 0.27;

    for (const direction of [-1, 1]) {
      const x = direction * faceWidth * 0.22;
      context.fillStyle = "#1d1d1d";
      context.strokeStyle = "rgba(255,255,255,0.32)";
      context.lineWidth = Math.max(3, faceWidth * 0.016);
      context.beginPath();
      context.moveTo(x, -earHeight);
      context.lineTo(x - direction * earWidth * 0.55, 0);
      context.lineTo(x + direction * earWidth * 0.55, 0);
      context.closePath();
      context.fill();
      context.stroke();

      context.fillStyle = "#f6a7b7";
      context.beginPath();
      context.moveTo(x, -earHeight * 0.6);
      context.lineTo(x - direction * earWidth * 0.25, -earHeight * 0.08);
      context.lineTo(x + direction * earWidth * 0.25, -earHeight * 0.08);
      context.closePath();
      context.fill();
    }
  });
};

const drawFaceOverlay = (
  context: CanvasRenderingContext2D,
  effect: CameraEffect,
  landmarks: Landmark[],
  width: number,
  height: number,
) => {
  const forehead = getLandmarkPoint(landmarks, 10, width, height);
  const chin = getLandmarkPoint(landmarks, 152, width, height);
  const leftEyeOuter = getLandmarkPoint(landmarks, 33, width, height);
  const rightEyeOuter = getLandmarkPoint(landmarks, 263, width, height);
  const faceAngle = getAngle(leftEyeOuter, rightEyeOuter);
  const faceWidth = Math.max(80, getDistance(leftEyeOuter, rightEyeOuter) * 2.25);
  const headTop = {
    x: forehead.x,
    y: forehead.y - getDistance(forehead, chin) * 0.22,
  };

  if (effect === "party-hat") {
    drawPartyHat(context, headTop, faceWidth, faceAngle);
  }
  if (effect === "cat-ears") {
    drawCatEars(context, headTop, faceWidth, faceAngle);
  }
};

const createBlurredTrack = async (
  sourceStream: MediaStream,
  sourceTrack: MediaStreamTrack,
): Promise<ManagedCameraTrack> => {
  const segmenter = await getImageSegmenterWithTimeout();
  const labels = segmenter.getLabels().map((label) => label.toLowerCase());
  const personLabelIndex = labels.findIndex(
    (label) =>
      label.includes("person") ||
      label.includes("human") ||
      label.includes("selfie") ||
      label.includes("foreground"),
  );
  const video = document.createElement("video");
  const outputCanvas = document.createElement("canvas");
  const foregroundCanvas = document.createElement("canvas");
  const maskCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  const foregroundContext = foregroundCanvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });
  const maskContext = maskCanvas.getContext("2d", { alpha: true });

  if (!outputContext || !foregroundContext || !maskContext) {
    stopMediaStream(sourceStream);
    throw new Error("Canvas processing is unavailable in this browser");
  }

  const sourceSettings = sourceTrack.getSettings();
  const frameRate =
    typeof sourceSettings.frameRate === "number" && sourceSettings.frameRate > 0
      ? sourceSettings.frameRate
      : 30;

  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;
  video.srcObject = sourceStream;

  try {
    await video.play();
  } catch {}
  await waitForVideoReady(video);

  const capturedStream = outputCanvas.captureStream(frameRate);
  const processedTrack = capturedStream.getVideoTracks()[0];

  if (!processedTrack) {
    stopMediaStream(capturedStream);
    stopMediaStream(sourceStream);
    throw new Error("Unable to capture processed video stream");
  }

  if ("contentHint" in processedTrack) {
    processedTrack.contentHint = "motion";
  }

  let rafId = 0;
  let stopped = false;
  let maskImageData: ImageData | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    sourceTrack.onended = null;
    processedTrack.onended = null;
    video.pause();
    video.srcObject = null;
    stopMediaStream(capturedStream);
    stopMediaStream(sourceStream);
  };

  sourceTrack.onended = stop;
  processedTrack.onended = stop;

  const renderFrame = () => {
    if (stopped) return;
    if (
      sourceTrack.readyState !== "live" ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      rafId = window.requestAnimationFrame(renderFrame);
      return;
    }

    const width = video.videoWidth || sourceSettings.width || 1280;
    const height = video.videoHeight || sourceSettings.height || 720;

    if (outputCanvas.width !== width || outputCanvas.height !== height) {
      outputCanvas.width = width;
      outputCanvas.height = height;
      foregroundCanvas.width = width;
      foregroundCanvas.height = height;
    }

    segmenter.segmentForVideo(video, performance.now(), (result) => {
      try {
        const confidenceMasks = result.confidenceMasks;
        const categoryMask = result.categoryMask;
        const mask =
          confidenceMasks && confidenceMasks.length > 0
            ? confidenceMasks[
                personLabelIndex >= 0
                  ? Math.min(personLabelIndex, confidenceMasks.length - 1)
                  : confidenceMasks.length > 1
                    ? 1
                    : 0
              ]
            : categoryMask;

        if (!mask) {
          outputContext.clearRect(0, 0, width, height);
          outputContext.drawImage(video, 0, 0, width, height);
          return;
        }

        const maskData = confidenceMasks?.length
          ? mask.getAsFloat32Array()
          : mask.getAsUint8Array();

        if (
          maskCanvas.width !== mask.width ||
          maskCanvas.height !== mask.height
        ) {
          maskCanvas.width = mask.width;
          maskCanvas.height = mask.height;
        }

        if (
          !maskImageData ||
          maskImageData.width !== mask.width ||
          maskImageData.height !== mask.height
        ) {
          maskImageData = new ImageData(mask.width, mask.height);
        }
        const alphaData = maskImageData.data;

        for (let index = 0; index < maskData.length; index += 1) {
          const offset = index * 4;
          const alpha =
            confidenceMasks?.length
              ? Math.max(
                  0,
                  Math.min(
                    255,
                    ((maskData[index] as number) - PERSON_MASK_THRESHOLD) *
                      (255 / (1 - PERSON_MASK_THRESHOLD)),
                  ),
                )
              : (maskData[index] as number) > 0
                ? 255
                : 0;
          alphaData[offset] = 255;
          alphaData[offset + 1] = 255;
          alphaData[offset + 2] = 255;
          alphaData[offset + 3] = alpha;
        }

        maskContext.putImageData(maskImageData, 0, 0);

        outputContext.clearRect(0, 0, width, height);
        outputContext.filter = `blur(${BACKGROUND_BLUR_RADIUS_PX}px)`;
        outputContext.drawImage(video, 0, 0, width, height);
        outputContext.filter = "none";

        foregroundContext.clearRect(0, 0, width, height);
        foregroundContext.globalCompositeOperation = "source-over";
        foregroundContext.drawImage(video, 0, 0, width, height);
        foregroundContext.globalCompositeOperation = "destination-in";
        foregroundContext.filter = `blur(${MASK_SOFTEN_RADIUS_PX}px)`;
        foregroundContext.drawImage(maskCanvas, 0, 0, width, height);
        foregroundContext.filter = "none";
        foregroundContext.globalCompositeOperation = "source-over";

        outputContext.drawImage(foregroundCanvas, 0, 0, width, height);
      } finally {
        result.close();
      }
    });

    rafId = window.requestAnimationFrame(renderFrame);
  };

  renderFrame();

  return {
    stream: new MediaStream([processedTrack]),
    track: processedTrack,
    stop,
  };
};

const createFaceOverlayTrack = async (
  sourceStream: MediaStream,
  sourceTrack: MediaStreamTrack,
  effect: CameraEffect,
): Promise<ManagedCameraTrack> => {
  const faceLandmarker = await getFaceLandmarkerWithTimeout();
  const video = document.createElement("video");
  const outputCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d", {
    alpha: true,
    desynchronized: true,
  });

  if (!outputContext) {
    stopMediaStream(sourceStream);
    throw new Error("Canvas processing is unavailable in this browser");
  }

  const sourceSettings = sourceTrack.getSettings();
  const frameRate =
    typeof sourceSettings.frameRate === "number" && sourceSettings.frameRate > 0
      ? sourceSettings.frameRate
      : 30;

  video.playsInline = true;
  video.autoplay = true;
  video.muted = true;
  video.srcObject = sourceStream;

  try {
    await video.play();
  } catch {}
  await waitForVideoReady(video);

  const capturedStream = outputCanvas.captureStream(frameRate);
  const processedTrack = capturedStream.getVideoTracks()[0];

  if (!processedTrack) {
    stopMediaStream(capturedStream);
    stopMediaStream(sourceStream);
    throw new Error("Unable to capture processed video stream");
  }

  if ("contentHint" in processedTrack) {
    processedTrack.contentHint = "motion";
  }

  let rafId = 0;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    sourceTrack.onended = null;
    processedTrack.onended = null;
    video.pause();
    video.srcObject = null;
    stopMediaStream(capturedStream);
    stopMediaStream(sourceStream);
  };

  sourceTrack.onended = stop;
  processedTrack.onended = stop;

  const renderFrame = () => {
    if (stopped) return;
    if (
      sourceTrack.readyState !== "live" ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      rafId = window.requestAnimationFrame(renderFrame);
      return;
    }

    const width = video.videoWidth || sourceSettings.width || 1280;
    const height = video.videoHeight || sourceSettings.height || 720;

    if (outputCanvas.width !== width || outputCanvas.height !== height) {
      outputCanvas.width = width;
      outputCanvas.height = height;
    }

    outputContext.clearRect(0, 0, width, height);
    outputContext.drawImage(video, 0, 0, width, height);

    try {
      const result = faceLandmarker.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks?.[0] as Landmark[] | undefined;

      if (landmarks?.length) {
        drawFaceOverlay(outputContext, effect, landmarks, width, height);
      }
    } catch (error) {
      console.warn("[Meets] Face filter frame failed:", error);
    }

    rafId = window.requestAnimationFrame(renderFrame);
  };

  renderFrame();

  return {
    stream: new MediaStream([processedTrack]),
    track: processedTrack,
    stop,
  };
};

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
