"use client";

import type { CameraEffect, CameraEffectOption } from "./types";

export const MEDIAPIPE_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
export const MEDIAPIPE_SELFIE_SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite";
export const MEDIAPIPE_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

export const BACKGROUND_BLUR_RADIUS_PX = 18;
export const MASK_SOFTEN_RADIUS_PX = 4;
export const PERSON_MASK_THRESHOLD = 0.5;
export const BLUR_SETUP_TIMEOUT_MS = 2500;
export const FACE_FILTER_SETUP_TIMEOUT_MS = 2500;

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
  {
    id: "3d-glasses",
    label: "3D Glasses",
    description: "Model-tracked glasses",
    category: "face",
    experimental: true,
  },
];

export const BACKGROUND_EFFECT_OPTIONS = CAMERA_EFFECT_OPTIONS;

export const getCameraEffectOption = (effect: CameraEffect) =>
  CAMERA_EFFECT_OPTIONS.find((option) => option.id === effect);

export const getBackgroundEffectOption = getCameraEffectOption;

