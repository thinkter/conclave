"use client";

import { Check, ChevronUp, FlipHorizontal2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { color } from "@conclave/ui-tokens";

type DeviceOption = { deviceId: string; label: string };

/**
 * Self-contained device enumeration (mirrors video-settings) — only runs while
 * a caret menu is open + listens for `devicechange`.
 */
function useEnumeratedDevices(active: boolean) {
  const [audioInput, setAudioInput] = useState<DeviceOption[]>([]);
  const [audioOutput, setAudioOutput] = useState<DeviceOption[]>([]);
  const [videoInput, setVideoInput] = useState<DeviceOption[]>([]);

  const fetchDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioInput(
        devices
          .filter((d) => d.kind === "audioinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` })),
      );
      setAudioOutput(
        devices
          .filter((d) => d.kind === "audiooutput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` })),
      );
      setVideoInput(
        devices
          .filter((d) => d.kind === "videoinput")
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
      );
    } catch {
      // enumeration can fail before permission — silently ignore.
    }
  }, []);

  useEffect(() => {
    if (active) void fetchDevices();
  }, [active, fetchDevices]);

  useEffect(() => {
    navigator.mediaDevices.addEventListener("devicechange", fetchDevices);
    return () =>
      navigator.mediaDevices.removeEventListener("devicechange", fetchDevices);
  }, [fetchDevices]);

  return { audioInput, audioOutput, videoInput };
}

function DeviceList({
  heading,
  devices,
  selectedId,
  onSelect,
}: {
  heading: string;
  devices: DeviceOption[];
  selectedId?: string;
  onSelect?: (deviceId: string) => void;
}) {
  if (!devices.length || !onSelect) return null;
  // If nothing is explicitly selected, the first device is the active default.
  const activeId = selectedId || devices[0]?.deviceId;
  return (
    <div className="px-1.5 pb-1 pt-1">
      <p
        className="px-2.5 pb-1 pt-1 text-[11.5px] font-medium"
        style={{ color: color.textFaint }}
      >
        {heading}
      </p>
      {devices.map((device) => {
        const isActive = device.deviceId === activeId;
        return (
          <button
            key={device.deviceId}
            type="button"
            onClick={() => onSelect(device.deviceId)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color] duration-[120ms] hover:bg-white/[0.06]"
            style={{ color: color.text }}
          >
            <span className="flex w-4 shrink-0 items-center justify-center">
              {isActive && <Check size={15} strokeWidth={2} className="text-[#F95F4A]" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{device.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export interface DeviceCaretMenuProps {
  kind: "audio" | "video";
  disabled?: boolean;
  selectedAudioInputDeviceId?: string;
  selectedAudioOutputDeviceId?: string;
  selectedVideoInputDeviceId?: string;
  onAudioInputDeviceChange?: (deviceId: string) => void;
  onAudioOutputDeviceChange?: (deviceId: string) => void;
  onVideoInputDeviceChange?: (deviceId: string) => void;
  isMirrorCamera?: boolean;
  onToggleMirror?: () => void;
}

/**
 * The Meet-style caret (^) that sits beside the mic / camera button and opens a
 * device picker popover. Audio caret = mic + speaker; video caret = camera +
 * mirror toggle.
 */
export function DeviceCaretMenu(props: DeviceCaretMenuProps) {
  const { kind, disabled } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { audioInput, audioOutput, videoInput } = useEnumeratedDevices(open);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect =
    (cb?: (id: string) => void) => (id: string) => {
      cb?.(id);
      setOpen(false);
    };

  return (
    <div ref={ref} className="relative flex">
      <button
        type="button"
        disabled={disabled}
        aria-label={kind === "audio" ? "Audio settings" : "Camera settings"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="group/caret flex h-12 w-8 items-center justify-center disabled:opacity-40"
        style={{ color: open ? color.accent : color.textMuted }}
      >
        {/* The hover highlight is a small CIRCLE around the chevron, not the full
            tall click target — a 48×28 rounded-full target reads as an awkward
            floating capsule next to the round mic/cam buttons. */}
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color] duration-[120ms] group-hover/caret:bg-white/[0.09]"
          style={open ? { backgroundColor: "rgba(249, 95, 74, 0.16)" } : undefined}
        >
          <ChevronUp
            size={15}
            strokeWidth={2.25}
            className={`transition-transform duration-[150ms] ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-1/2 mb-3 w-64 -translate-x-1/2">
          <div
            className="origin-bottom rounded-2xl border p-1 will-change-transform animate-[meet-popover-in_150ms_cubic-bezier(0.22,1,0.36,1)]"
            style={{ backgroundColor: color.surfaceRaised, borderColor: color.border }}
          >
            {kind === "audio" ? (
              <>
                <DeviceList
                  heading="Microphone"
                  devices={audioInput}
                  selectedId={props.selectedAudioInputDeviceId}
                  onSelect={handleSelect(props.onAudioInputDeviceChange)}
                />
                <DeviceList
                  heading="Speaker"
                  devices={audioOutput}
                  selectedId={props.selectedAudioOutputDeviceId}
                  onSelect={handleSelect(props.onAudioOutputDeviceChange)}
                />
              </>
            ) : (
              <>
                <DeviceList
                  heading="Camera"
                  devices={videoInput}
                  selectedId={props.selectedVideoInputDeviceId}
                  onSelect={handleSelect(props.onVideoInputDeviceChange)}
                />
                {props.onToggleMirror && (
                  <div className="px-1.5 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        props.onToggleMirror?.();
                        setOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color] duration-[120ms] hover:bg-white/[0.06]"
                      style={{ color: color.text }}
                    >
                      <FlipHorizontal2 size={16} strokeWidth={1.75} className="shrink-0" />
                      <span className="flex-1">Mirror my video</span>
                      <span
                        className="text-[12px]"
                        style={{ color: props.isMirrorCamera ? color.accent : color.textFaint }}
                      >
                        {props.isMirrorCamera ? "On" : "Off"}
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
