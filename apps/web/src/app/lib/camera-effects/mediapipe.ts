"use client";

import {
  BLUR_SETUP_TIMEOUT_MS,
  FACE_FILTER_SETUP_TIMEOUT_MS,
  MEDIAPIPE_FACE_LANDMARKER_MODEL,
  MEDIAPIPE_SELFIE_SEGMENTER_MODEL,
  MEDIAPIPE_WASM_ROOT,
} from "./constants";

type VisionModule = typeof import("@mediapipe/tasks-vision");
type FaceLandmarker = import("@mediapipe/tasks-vision").FaceLandmarker;
type ImageSegmenter = import("@mediapipe/tasks-vision").ImageSegmenter;

let visionModulePromise: Promise<VisionModule> | null = null;
let segmenterPromise: Promise<ImageSegmenter> | null = null;
let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

const loadVisionModule = async (): Promise<VisionModule> => {
  if (!visionModulePromise) {
    visionModulePromise = import("@mediapipe/tasks-vision");
  }

  return visionModulePromise;
};

const getImageSegmenter = async () => {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await loadVisionModule();
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

export const getImageSegmenterWithTimeout = async () => {
  return Promise.race([
    getImageSegmenter(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Background blur setup timed out"));
      }, BLUR_SETUP_TIMEOUT_MS);
    }),
  ]);
};

export const getFaceLandmarkerWithTimeout = async () => {
  return Promise.race([
    getFaceLandmarker(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("Face filter setup timed out"));
      }, FACE_FILTER_SETUP_TIMEOUT_MS);
    }),
  ]);
};

