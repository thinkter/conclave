"use client";

import {
  getAngle,
  getDistance,
  getLandmarkPoint,
} from "../landmarks";
import { getFaceLandmarkerWithTimeout } from "../mediapipe";
import { stopMediaStream, waitForVideoReady } from "../media";
import type { CameraEffect, Landmark, ManagedCameraTrack } from "../types";

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

    context.fillStyle = "#5B7CFA";
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
  const faceWidth = Math.max(
    80,
    getDistance(leftEyeOuter, rightEyeOuter) * 2.25,
  );
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

export const createFaceOverlayTrack = async (
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

