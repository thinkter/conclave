"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type BackgroundMode = "blur" | "image";

type GreenScreenModule = typeof import("greenscreenstream");
type GreenScreenInstance = InstanceType<GreenScreenModule["GreenScreenStream"]>;

type BlurPipeline = {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  stream: MediaStream;
  frameId: number;
};

const BLUR_RADIUS_PX = 24;
const TARGET_FPS = 24;
const DEFAULT_BACKGROUND_IMAGE = "/og.png";

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      resolve();
    };
    video.addEventListener("loadeddata", onReady);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load background image."));
    image.src = src;
  });
}

export default function GreenPage() {
  const outputVideoRef = useRef<HTMLVideoElement | null>(null);
  const rawVideoRef = useRef<HTMLVideoElement | null>(null);
  const greenRef = useRef<GreenScreenInstance | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const blurPipelineRef = useRef<BlurPipeline | null>(null);

  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>("blur");
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>("");
  const [imageName, setImageName] = useState<string>("");
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState("Requesting camera access...");
  const [error, setError] = useState<string>("");

  const modeLabel = useMemo(() => {
    if (backgroundMode === "blur") {
      return "Blurred background";
    }
    return imageName ? `Image background (${imageName})` : "Image background";
  }, [backgroundMode, imageName]);

  const stopBlurPipeline = useCallback(() => {
    const pipeline = blurPipelineRef.current;
    if (!pipeline) {
      return;
    }

    cancelAnimationFrame(pipeline.frameId);
    pipeline.stream.getTracks().forEach((track) => track.stop());
    pipeline.video.srcObject = null;
    blurPipelineRef.current = null;
  }, []);

  const cleanupAll = useCallback(() => {
    const green = greenRef.current;
    if (green) {
      green.stop(true);
      greenRef.current = null;
    }

    stopBlurPipeline();

    const rawStream = rawStreamRef.current;
    if (rawStream) {
      rawStream.getTracks().forEach((track) => track.stop());
      rawStreamRef.current = null;
    }

    if (outputVideoRef.current) {
      outputVideoRef.current.srcObject = null;
    }
    if (rawVideoRef.current) {
      rawVideoRef.current.srcObject = null;
    }
  }, [stopBlurPipeline]);

  const ensureBlurPipeline = useCallback(async (): Promise<BlurPipeline> => {
    if (blurPipelineRef.current) {
      return blurPipelineRef.current;
    }

    const rawStream = rawStreamRef.current;
    if (!rawStream) {
      throw new Error("Camera stream is unavailable.");
    }

    const previewVideo = rawVideoRef.current;
    if (!previewVideo) {
      throw new Error("Raw preview video element is unavailable.");
    }

    const settings = rawStream.getVideoTracks()[0]?.getSettings();
    const width = settings?.width ?? 1280;
    const height = settings?.height ?? 720;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Unable to create 2D canvas context for blur pipeline.");
    }

    const renderBlurFrame = () => {
      context.save();
      context.filter = `blur(${BLUR_RADIUS_PX}px)`;
      context.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
      context.restore();
      const frameId = requestAnimationFrame(renderBlurFrame);
      if (blurPipelineRef.current) {
        blurPipelineRef.current.frameId = frameId;
      }
    };

    const stream = canvas.captureStream(TARGET_FPS);
    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await video.play();

    const frameId = requestAnimationFrame(renderBlurFrame);
    const pipeline: BlurPipeline = { canvas, video, stream, frameId };
    blurPipelineRef.current = pipeline;
    return pipeline;
  }, []);

  const applyBackgroundMode = useCallback(async () => {
    const green = greenRef.current;
    if (!green) {
      return;
    }

    if (backgroundMode === "blur") {
      setStatus("Applying blurred background...");
      const pipeline = await ensureBlurPipeline();
      green.backgroundSource = pipeline.video;
      setStatus("Blurred background is active.");
      return;
    }

    if (!uploadedImageUrl) {
      setStatus("Upload an image to activate image background mode.");
      return;
    }

    setStatus("Applying image background...");
    const image = await loadImage(uploadedImageUrl);
    green.backgroundSource = image;
    setStatus("Image background is active.");
  }, [backgroundMode, ensureBlurPipeline, uploadedImageUrl]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setError("");
        setStatus("Requesting camera access...");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        rawStreamRef.current = stream;

        if (!rawVideoRef.current) {
          throw new Error("Missing raw preview video element.");
        }

        rawVideoRef.current.srcObject = stream;
        await rawVideoRef.current.play();
        await waitForVideoReady(rawVideoRef.current);

        setStatus("Loading GreenScreenStream model...");
        const importedModule = await import("greenscreenstream");
        const gssModule = (((importedModule as GreenScreenModule).GreenScreenStream
          ? importedModule
          : (importedModule as { default: GreenScreenModule }).default) ?? importedModule) as GreenScreenModule;
        const GreenScreenStreamCtor = gssModule.GreenScreenStream;
        const GreenScreenMethodEnum = gssModule.GreenScreenMethod;

        if (!GreenScreenStreamCtor || !GreenScreenMethodEnum) {
          throw new Error("Unable to load GreenScreenStream exports.");
        }

        const processor = new GreenScreenStreamCtor(
          GreenScreenMethodEnum.VirtualBackground,
          undefined,
          rawVideoRef.current.videoWidth || 1280,
          rawVideoRef.current.videoHeight || 720,
        );

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          throw new Error("No camera video track found.");
        }

        await processor.addVideoTrack(videoTrack);

        await processor.initialize(DEFAULT_BACKGROUND_IMAGE, {
          maskSettings: {
            maskBlurAmount: 5,
            segmentPerson: {
              segmentationThreshold: 0.7,
            },
          },
          bodyPixMode: gssModule.GreenScreenStreamBodyPixMode.Standard,
        });
        processor.start(TARGET_FPS);

        if (!outputVideoRef.current) {
          throw new Error("Missing output video element.");
        }

        const outputStream = processor.captureStream(TARGET_FPS);
        outputVideoRef.current.srcObject = outputStream;
        await outputVideoRef.current.play();

        greenRef.current = processor;
        setIsReady(true);
        setStatus("Processor ready.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to initialize /green.";
        setError(message);
        setStatus("Initialization failed.");
      }
    };

    init();

    return () => {
      cancelled = true;
      cleanupAll();
    };
  }, [cleanupAll]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    applyBackgroundMode().catch((err) => {
      const message = err instanceof Error ? err.message : "Unable to switch background mode.";
      setError(message);
    });
  }, [applyBackgroundMode, isReady]);

  useEffect(() => {
    return () => {
      if (uploadedImageUrl) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
    };
  }, [uploadedImageUrl]);

  return (
    <main className="min-h-screen bg-[#060606] text-[#FEFCD9]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 md:px-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">/green</h1>
            <p className="mt-2 text-sm text-[#FEFCD9]/80">
              Virtual background demo powered by <code className="rounded bg-[#FEFCD9]/10 px-1 py-0.5">greenscreenstream</code>
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#FEFCD9]/30 px-4 py-2 text-sm hover:bg-[#FEFCD9]/10"
          >
            Back Home
          </Link>
        </header>

        <section className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          <div className="overflow-hidden rounded-2xl border border-[#FEFCD9]/20 bg-black">
            <video
              ref={outputVideoRef}
              className="aspect-video h-full w-full bg-black object-cover"
              autoPlay
              muted
              playsInline
            />
          </div>

          <aside className="rounded-2xl border border-[#FEFCD9]/20 bg-[#121212] p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-[#FEFCD9]/70">Background Mode</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setBackgroundMode("blur");
                }}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  backgroundMode === "blur"
                    ? "bg-[#F95F4A] text-white"
                    : "border border-[#FEFCD9]/30 bg-transparent text-[#FEFCD9]/90 hover:bg-[#FEFCD9]/10"
                }`}
              >
                Blur
              </button>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setBackgroundMode("image");
                }}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  backgroundMode === "image"
                    ? "bg-[#F95F4A] text-white"
                    : "border border-[#FEFCD9]/30 bg-transparent text-[#FEFCD9]/90 hover:bg-[#FEFCD9]/10"
                }`}
              >
                Image
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-[#FEFCD9]/25 p-3">
              <label htmlFor="bg-image" className="block text-sm text-[#FEFCD9]/85">
                Upload background image
              </label>
              <input
                id="bg-image"
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                className="mt-2 block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[#F95F4A] file:px-3 file:py-1.5 file:text-white"
                onChange={(event) => {
                  setError("");
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const objectUrl = URL.createObjectURL(file);
                  setUploadedImageUrl((previous) => {
                    if (previous) {
                      URL.revokeObjectURL(previous);
                    }
                    return objectUrl;
                  });
                  setImageName(file.name);
                  setBackgroundMode("image");
                }}
              />
              <p className="mt-2 text-xs text-[#FEFCD9]/60">PNG/JPG files work best. Max quality depends on your camera and GPU.</p>
            </div>

            <div className="mt-4 space-y-1 text-sm text-[#FEFCD9]/85">
              <p>
                <span className="text-[#FEFCD9]/60">Current:</span> {modeLabel}
              </p>
              <p>
                <span className="text-[#FEFCD9]/60">Status:</span> {status}
              </p>
              {error ? <p className="text-[#ff8f8f]">{error}</p> : null}
            </div>
          </aside>
        </section>

        <div className="rounded-xl border border-[#FEFCD9]/15 bg-[#0f0f0f] p-3">
          <p className="mb-2 text-xs uppercase tracking-[0.12em] text-[#FEFCD9]/60">Raw Camera (debug)</p>
          <video ref={rawVideoRef} className="h-28 w-48 rounded-lg border border-[#FEFCD9]/20 object-cover" autoPlay muted playsInline />
        </div>
      </div>
    </main>
  );
}
