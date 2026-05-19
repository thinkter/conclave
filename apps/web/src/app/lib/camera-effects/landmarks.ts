"use client";

import type { Landmark } from "./types";

export const getLandmarkPoint = (
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

export const getLandmarkPoint3D = (
  landmarks: Landmark[],
  index: number,
  width: number,
  height: number,
) => {
  const landmark = landmarks[index];
  return {
    x: (landmark?.x ?? 0) * width,
    y: (landmark?.y ?? 0) * height,
    z: (landmark?.z ?? 0) * width,
  };
};

export const transformLandmarksForThree = (
  landmarks: Landmark[],
): Landmark[] => {
  const minZ = Math.max(-(landmarks[234]?.z ?? 0), -(landmarks[454]?.z ?? 0));

  return landmarks.map((landmark) => ({
    x: -0.5 + landmark.x,
    y: 0.5 - landmark.y,
    z: -(landmark.z ?? 0) - minZ,
  }));
};

export const getAngle = (
  start: { x: number; y: number },
  end: { x: number; y: number },
) => Math.atan2(end.y - start.y, end.x - start.x);

export const getDistance = (
  start: { x: number; y: number },
  end: { x: number; y: number },
) => Math.hypot(end.x - start.x, end.y - start.y);

