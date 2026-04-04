"use client";

import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";

const MEDIAPIPE_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const MEDIAPIPE_FACE_LANDMARKER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type FaceFilterType = "none" | "aviator-glasses";

export interface FaceFilterOption {
  id: FaceFilterType;
  label: string;
  description: string;
  category: "none" | "glasses" | "fun";
  assetPath?: string;
}

export const FACE_FILTER_OPTIONS: FaceFilterOption[] = [
  {
    id: "none",
    label: "None",
    description: "No face filter",
    category: "none",
  },
  {
    id: "aviator-glasses",
    label: "Aviator",
    description: "Classic aviator sunglasses",
    category: "glasses",
    assetPath: "/filters/aviator-glasses.png",
  },
];

export const getFaceFilterOption = (filter: FaceFilterType) =>
  FACE_FILTER_OPTIONS.find((option) => option.id === filter);

// Face landmark indices for positioning glasses
// Reference: https://github.com/google/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model_uv_visualization.png
const LANDMARKS = {
  // Eye corners for glasses positioning
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  RIGHT_EYE_OUTER: 263,
  // Eye centers
  LEFT_EYE_CENTER: 468, // Or use iris center if available
  RIGHT_EYE_CENTER: 473,
  // Nose bridge (for glasses bridge)
  NOSE_BRIDGE_TOP: 6,
  NOSE_TIP: 1,
  // Forehead
  FOREHEAD_CENTER: 10,
  // Face sides (for ear positions / temple arms)
  LEFT_EAR: 234,
  RIGHT_EAR: 454,
} as const;

type VisionModule = typeof import("@mediapipe/tasks-vision");

let visionModulePromise: Promise<VisionModule> | null = null;
let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

// Asset cache
const assetCache = new Map<string, HTMLImageElement>();

const loadVisionModule = async (): Promise<VisionModule> => {
  if (!visionModulePromise) {
    visionModulePromise = import("@mediapipe/tasks-vision");
  }
  return visionModulePromise;
};

export const getFaceLandmarker = async (): Promise<FaceLandmarker> => {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await loadVisionModule();
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MEDIAPIPE_FACE_LANDMARKER_MODEL,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    })();

    faceLandmarkerPromise = faceLandmarkerPromise.catch((error) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }

  return faceLandmarkerPromise;
};

export const preloadFilterAsset = async (assetPath: string): Promise<HTMLImageElement> => {
  if (assetCache.has(assetPath)) {
    return assetCache.get(assetPath)!;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      assetCache.set(assetPath, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load filter asset: ${assetPath}`));
    img.src = assetPath;
  });
};

export const preloadFaceFilter = async (filter: FaceFilterType): Promise<void> => {
  const option = getFaceFilterOption(filter);
  if (!option || !option.assetPath) return;

  await Promise.all([
    getFaceLandmarker(),
    preloadFilterAsset(option.assetPath),
  ]);
};

interface RenderFilterOptions {
  ctx: CanvasRenderingContext2D;
  result: FaceLandmarkerResult;
  filter: FaceFilterType;
  canvasWidth: number;
  canvasHeight: number;
}

export const renderFaceFilter = async ({
  ctx,
  result,
  filter,
  canvasWidth,
  canvasHeight,
}: RenderFilterOptions): Promise<void> => {
  if (filter === "none" || !result.faceLandmarks || result.faceLandmarks.length === 0) {
    return;
  }

  const landmarks = result.faceLandmarks[0];
  if (!landmarks || landmarks.length === 0) return;

  const option = getFaceFilterOption(filter);
  if (!option || !option.assetPath) return;

  // Get or load the asset
  let asset = assetCache.get(option.assetPath);
  if (!asset) {
    try {
      asset = await preloadFilterAsset(option.assetPath);
    } catch {
      console.warn(`Failed to load filter asset: ${option.assetPath}`);
      return;
    }
  }

  if (filter === "aviator-glasses") {
    renderAviatorGlasses(ctx, landmarks, asset, canvasWidth, canvasHeight);
  }
};

interface Landmark {
  x: number;
  y: number;
  z: number;
}

const renderAviatorGlasses = (
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  asset: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): void => {
  // Get key landmarks
  const leftEyeOuter = landmarks[LANDMARKS.LEFT_EYE_OUTER];
  const rightEyeOuter = landmarks[LANDMARKS.RIGHT_EYE_OUTER];
  const leftEyeInner = landmarks[LANDMARKS.LEFT_EYE_INNER];
  const rightEyeInner = landmarks[LANDMARKS.RIGHT_EYE_INNER];
  const noseBridge = landmarks[LANDMARKS.NOSE_BRIDGE_TOP];

  if (!leftEyeOuter || !rightEyeOuter || !leftEyeInner || !rightEyeInner || !noseBridge) {
    return;
  }

  // Convert normalized coordinates to canvas pixels
  const toPixel = (landmark: Landmark) => ({
    x: landmark.x * canvasWidth,
    y: landmark.y * canvasHeight,
  });

  const leftOuter = toPixel(leftEyeOuter);
  const rightOuter = toPixel(rightEyeOuter);
  const leftInner = toPixel(leftEyeInner);
  const rightInner = toPixel(rightEyeInner);
  const bridge = toPixel(noseBridge);

  // Calculate the width of the glasses based on eye positions
  // Add some padding to extend beyond the eyes
  const eyeWidth = Math.sqrt(
    Math.pow(rightOuter.x - leftOuter.x, 2) + 
    Math.pow(rightOuter.y - leftOuter.y, 2)
  );
  
  // Glasses should be significantly wider than the eye span for aviator style
  const glassesWidth = eyeWidth * 1.65;
  
  // Calculate aspect ratio to maintain proper height
  const aspectRatio = asset.height / asset.width;
  const glassesHeight = glassesWidth * aspectRatio;

  // Calculate center position (between the eyes, slightly below the bridge)
  const centerX = (leftOuter.x + rightOuter.x) / 2;
  // Position slightly lower - weight toward nose bridge more
  const centerY = (leftOuter.y + rightOuter.y) / 2 * 0.85 + bridge.y * 0.15;

  // Calculate rotation angle based on eye positions
  const angle = Math.atan2(
    rightOuter.y - leftOuter.y,
    rightOuter.x - leftOuter.x
  );

  // Draw the glasses
  ctx.save();
  
  // Move to center, rotate, then draw
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  
  // Draw centered on the transform origin
  ctx.drawImage(
    asset,
    -glassesWidth / 2,
    -glassesHeight / 2,
    glassesWidth,
    glassesHeight
  );
  
  ctx.restore();
};

// Cleanup function
export const cleanupFaceLandmarker = async (): Promise<void> => {
  if (faceLandmarkerPromise) {
    try {
      const landmarker = await faceLandmarkerPromise;
      landmarker.close();
    } catch {
      // Ignore errors during cleanup
    }
    faceLandmarkerPromise = null;
  }
};
