"use client";

import {
  BACKGROUND_BLUR_RADIUS_PX,
  MASK_SOFTEN_RADIUS_PX,
  PERSON_MASK_THRESHOLD,
} from "../constants";
import { getImageSegmenterWithTimeout } from "../mediapipe";
import { stopMediaStream, waitForVideoReady } from "../media";
import type { ManagedCameraTrack } from "../types";

export const createBlurredTrack = async (
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

