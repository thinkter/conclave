"use client";

import { Check, Glasses, ScanFace, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BACKGROUND_EFFECT_OPTIONS,
  type BackgroundEffect,
  type FaceFilterType,
  FACE_FILTER_OPTIONS,
  createManagedCameraTrackWithEffects,
  createManagedCameraTrackFromTrackWithEffects,
  type ManagedCameraTrack,
} from "../lib/background-blur";

interface CameraFiltersDrawerProps {
  isOpen: boolean;
  backgroundEffect: BackgroundEffect;
  faceFilter?: FaceFilterType;
  onSelect: (backgroundEffect: BackgroundEffect, faceFilter?: FaceFilterType) => void;
  onClose: () => void;
  localStream?: MediaStream | null;
  isCameraOff?: boolean;
  isMirrorCamera?: boolean;
  className?: string;
}

export default function CameraFiltersDrawer({
  isOpen,
  backgroundEffect,
  faceFilter = "none",
  onSelect,
  onClose,
  localStream,
  isCameraOff = false,
  isMirrorCamera = true,
  className = "",
}: CameraFiltersDrawerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewBackgroundEffect, setPreviewBackgroundEffect] = useState<BackgroundEffect>(backgroundEffect);
  const [previewFaceFilter, setPreviewFaceFilter] = useState<FaceFilterType>(faceFilter);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const trackRef = useRef<ManagedCameraTrack | null>(null);
  const previewRequestIdRef = useRef(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPreviewBackgroundEffect(backgroundEffect);
      setPreviewFaceFilter(faceFilter);
    }
  }, [isOpen, backgroundEffect, faceFilter]);

  useEffect(() => {
    const requestId = ++previewRequestIdRef.current;

    const releaseManagedPreview = () => {
      if (trackRef.current) {
        trackRef.current.stop();
        trackRef.current = null;
      }
    };

    async function updatePreview() {
      if (!isOpen) {
        releaseManagedPreview();
        setPreviewStream(null);
        setIsLoading(false);
        return;
      }

      const liveLocalVideoTrack = localStream?.getVideoTracks()[0];
      const canUseLiveLocalTrack =
        !isCameraOff && liveLocalVideoTrack?.readyState === "live";
      const noEffectsSelected = previewBackgroundEffect === "none" && previewFaceFilter === "none";
      const currentEffectsMatch = previewBackgroundEffect === backgroundEffect && previewFaceFilter === faceFilter;

      if (canUseLiveLocalTrack && currentEffectsMatch) {
        releaseManagedPreview();
        setPreviewStream(localStream ?? null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      releaseManagedPreview();

      try {
        const managedTrack = canUseLiveLocalTrack && noEffectsSelected
          ? await createManagedCameraTrackFromTrackWithEffects({
              backgroundEffect: previewBackgroundEffect,
              faceFilter: previewFaceFilter,
              sourceTrack: liveLocalVideoTrack,
            })
          : await createManagedCameraTrackWithEffects({
              backgroundEffect: previewBackgroundEffect,
              faceFilter: previewFaceFilter,
              quality: "standard",
            });

        if (previewRequestIdRef.current === requestId) {
          trackRef.current = managedTrack;
          setPreviewStream(managedTrack.stream);
        } else {
          managedTrack.stop();
        }
      } catch (err) {
        if (previewRequestIdRef.current === requestId) {
          console.error("Failed to get preview stream:", err);
          setPreviewStream(null);
        }
      } finally {
        if (previewRequestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }

    updatePreview();

    return () => {
      if (previewRequestIdRef.current === requestId) {
        previewRequestIdRef.current += 1;
      }
      releaseManagedPreview();
    };
  }, [backgroundEffect, faceFilter, isCameraOff, isOpen, localStream, previewBackgroundEffect, previewFaceFilter]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = previewStream;
    if (!previewStream) return;
    video.play().catch(() => {});
  }, [previewStream]);

  const handleApply = () => {
    onSelect(previewBackgroundEffect, previewFaceFilter);
    onClose();
  };

  // Get current effect label for the preview badge
  const getPreviewLabel = () => {
    const labels: string[] = [];
    if (previewBackgroundEffect !== "none") {
      const bgOption = BACKGROUND_EFFECT_OPTIONS.find((o) => o.id === previewBackgroundEffect);
      if (bgOption) labels.push(bgOption.label);
    }
    if (previewFaceFilter !== "none") {
      const faceOption = FACE_FILTER_OPTIONS.find((o) => o.id === previewFaceFilter);
      if (faceOption) labels.push(faceOption.label);
    }
    return labels.length > 0 ? labels.join(" + ") : "Original";
  };

  // Get icon for filter type
  const getFilterIcon = (category: string, isSelected: boolean) => {
    const className = `h-5 w-5 ${isSelected ? "text-[#F95F4A]" : "text-[#FEFCD9]/55"}`;
    switch (category) {
      case "glasses":
        return <Glasses className={className} />;
      case "fun":
        return <Sparkles className={className} />;
      default:
        return <ScanFace className={className} />;
    }
  };

  // Filter face filters to only show glasses category for now
  const glassesFilters = FACE_FILTER_OPTIONS.filter((f) => f.category === "glasses");

  return (
    <div
      className={`pointer-events-auto flex h-full w-[320px] sm:w-[360px] max-w-[100vw] flex-col overflow-hidden rounded-[28px] border border-[#FEFCD9]/12 bg-[#090909]/92 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 ${
        isOpen
          ? "translate-x-0 opacity-100"
          : "-translate-x-8 opacity-0 pointer-events-none"
      } ${className}`}
      style={{ fontFamily: "'PolySans Trial', sans-serif" }}
    >
      <div className="flex items-center justify-between border-b border-[#FEFCD9]/10 px-4 py-3">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.18em] text-[#FEFCD9]/35"
            style={{ fontFamily: "'PolySans Mono', monospace" }}
          >
            Camera Filters
          </div>
          <div className="mt-1 text-sm text-[#FEFCD9]">Preview your look</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#FEFCD9]/45 transition-colors hover:bg-[#FEFCD9]/8 hover:text-[#FEFCD9]"
          aria-label="Close filters"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[22px] border border-[#FEFCD9]/10 bg-gradient-to-br from-[#151515] to-[#090909]">
          {previewStream ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`h-full w-full object-cover ${isMirrorCamera ? "scale-x-[-1]" : ""}`}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,_rgba(249,95,74,0.2),_transparent_55%),linear-gradient(180deg,_#151515,_#090909)]">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#FEFCD9]/15 bg-[#FEFCD9]/6">
                <ScanFace className={`h-7 w-7 text-[#FEFCD9]/60 ${isLoading ? "animate-pulse" : ""}`} />
              </div>
              <div className="text-center">
                <div className="text-sm text-[#FEFCD9]/80">
                  {isLoading ? "Starting preview..." : "Camera preview unavailable"}
                </div>
              </div>
            </div>
          )}

          <div className="absolute inset-x-3 bottom-3 flex items-center justify-center pointer-events-none">
            <div className="rounded-full border border-[#FEFCD9]/10 bg-black/45 px-3 py-1.5 backdrop-blur-sm">
              <span className="text-[10px] uppercase tracking-[0.16em] text-[#FEFCD9]/70">
                {getPreviewLabel()}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 border-t border-[#FEFCD9]/10 px-2 py-2 flex flex-col overflow-y-auto">
        {/* Background Effects Section */}
        <div
          className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.16em] text-[#FEFCD9]/35"
          style={{ fontFamily: "'PolySans Mono', monospace" }}
        >
          Background
        </div>
        <div className="flex flex-col gap-2 px-2 pb-3">
          {BACKGROUND_EFFECT_OPTIONS.map((option) => {
            const isSelected = option.id === previewBackgroundEffect;
            return (
              <button
                key={option.id}
                onClick={() => setPreviewBackgroundEffect(option.id)}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  isSelected
                    ? "border-[#F95F4A]/45 bg-[linear-gradient(135deg,rgba(249,95,74,0.18),rgba(255,0,122,0.08))] text-[#FEFCD9]"
                    : "border-[#FEFCD9]/10 bg-[#111111]/80 text-[#FEFCD9]/75 hover:border-[#FEFCD9]/20 hover:bg-[#171717]"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    isSelected
                      ? "border-[#F95F4A]/35 bg-[#F95F4A]/12"
                      : "border-[#FEFCD9]/10 bg-[#FEFCD9]/5"
                  }`}
                >
                  <ScanFace
                    className={`h-5 w-5 ${
                      isSelected ? "text-[#F95F4A]" : "text-[#FEFCD9]/55"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{option.label}</div>
                  <div className="text-[11px] text-[#FEFCD9]/45">
                    {option.description}
                  </div>
                </div>
                {isSelected ? <Check className="h-4 w-4 shrink-0 text-[#F95F4A]" /> : null}
              </button>
            );
          })}
        </div>

        {/* Face Filters Section - Glasses */}
        {glassesFilters.length > 0 && (
          <>
            <div
              className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.16em] text-[#FEFCD9]/35"
              style={{ fontFamily: "'PolySans Mono', monospace" }}
            >
              Face Filters
            </div>
            <div className="flex flex-col gap-2 px-2 pb-3">
              {/* None option for face filters */}
              <button
                onClick={() => setPreviewFaceFilter("none")}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  previewFaceFilter === "none"
                    ? "border-[#F95F4A]/45 bg-[linear-gradient(135deg,rgba(249,95,74,0.18),rgba(255,0,122,0.08))] text-[#FEFCD9]"
                    : "border-[#FEFCD9]/10 bg-[#111111]/80 text-[#FEFCD9]/75 hover:border-[#FEFCD9]/20 hover:bg-[#171717]"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    previewFaceFilter === "none"
                      ? "border-[#F95F4A]/35 bg-[#F95F4A]/12"
                      : "border-[#FEFCD9]/10 bg-[#FEFCD9]/5"
                  }`}
                >
                  <ScanFace
                    className={`h-5 w-5 ${
                      previewFaceFilter === "none" ? "text-[#F95F4A]" : "text-[#FEFCD9]/55"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">None</div>
                  <div className="text-[11px] text-[#FEFCD9]/45">
                    No face filter
                  </div>
                </div>
                {previewFaceFilter === "none" ? <Check className="h-4 w-4 shrink-0 text-[#F95F4A]" /> : null}
              </button>

              {glassesFilters.map((option) => {
                const isSelected = option.id === previewFaceFilter;
                return (
                  <button
                    key={option.id}
                    onClick={() => setPreviewFaceFilter(option.id)}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                      isSelected
                        ? "border-[#F95F4A]/45 bg-[linear-gradient(135deg,rgba(249,95,74,0.18),rgba(255,0,122,0.08))] text-[#FEFCD9]"
                        : "border-[#FEFCD9]/10 bg-[#111111]/80 text-[#FEFCD9]/75 hover:border-[#FEFCD9]/20 hover:bg-[#171717]"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isSelected
                          ? "border-[#F95F4A]/35 bg-[#F95F4A]/12"
                          : "border-[#FEFCD9]/10 bg-[#FEFCD9]/5"
                      }`}
                    >
                      {getFilterIcon(option.category, isSelected)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm flex items-center gap-2">
                        {option.label}
                        <span className="rounded-full bg-[#10b981]/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#10b981]">
                          New
                        </span>
                      </div>
                      <div className="text-[11px] text-[#FEFCD9]/45">
                        {option.description}
                      </div>
                    </div>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-[#F95F4A]" /> : null}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      
      <div className="border-t border-[#FEFCD9]/10 p-4">
        <button
          onClick={handleApply}
          className="w-full rounded-2xl bg-[#FEFCD9] px-4 py-3.5 text-sm font-semibold text-black transition-all hover:bg-white active:scale-[0.98]"
        >
          Apply Filter
        </button>
      </div>
    </div>
  );
}
