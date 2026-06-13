"use client";

import {
  Check,
  Grid3X3,
  Minimize2,
  PanelRight,
  PictureInPicture2,
  Scan,
  Square,
  UserRound,
  X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import {
  clampMeetViewTiles,
  MEET_VIEW_MAX_TILES,
  MEET_VIEW_MIN_TILES,
  type MeetSelfViewMode,
  type MeetViewMode,
  type MeetViewSettings,
} from "../lib/meet-view";

interface MeetViewPanelProps {
  settings: MeetViewSettings;
  onSettingsChange: Dispatch<SetStateAction<MeetViewSettings>>;
  participantCount: number;
  onClose: () => void;
}

const MODE_OPTIONS: {
  id: MeetViewMode;
  label: string;
  icon: typeof Grid3X3;
}[] = [
  { id: "auto", label: "Auto", icon: Scan },
  { id: "tiled", label: "Tiled", icon: Grid3X3 },
  { id: "spotlight", label: "Spotlight", icon: Square },
  { id: "sidebar", label: "Sidebar", icon: PanelRight },
];

const SELF_VIEW_OPTIONS: {
  id: MeetSelfViewMode;
  label: string;
  icon: typeof Grid3X3;
}[] = [
  { id: "auto", label: "Auto", icon: Scan },
  { id: "tile", label: "In a tile", icon: UserRound },
  { id: "floating", label: "Floating", icon: PictureInPicture2 },
  { id: "minimized", label: "Minimized", icon: Minimize2 },
];

export default function MeetViewPanel({
  settings,
  onSettingsChange,
  participantCount,
  onClose,
}: MeetViewPanelProps) {
  const setMode = (mode: MeetViewMode) => {
    onSettingsChange((current) => ({ ...current, mode }));
  };

  const setMaxTiles = (value: number) => {
    onSettingsChange((current) => ({
      ...current,
      maxTiles: clampMeetViewTiles(value),
    }));
  };
  const commitMaxTilesValue = (value: string) => {
    setMaxTiles(Number(value));
  };

  const setHideTilesWithoutVideo = (hideTilesWithoutVideo: boolean) => {
    onSettingsChange((current) => ({ ...current, hideTilesWithoutVideo }));
  };

  const setSelfViewMode = (selfViewMode: MeetSelfViewMode) => {
    onSettingsChange((current) => ({ ...current, selfViewMode }));
  };

  return (
    <aside
      className="fixed bottom-24 right-4 top-4 z-40 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[28px] border border-[#dadce0] bg-white text-[#202124] shadow-[0_18px_55px_rgba(60,64,67,0.28)] animate-[meet-panel-in_180ms_cubic-bezier(0.22,1,0.36,1)]"
      aria-label="Adjust view"
    >
      <header className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-4">
        <div>
          <h2 className="text-[17px] font-medium leading-tight">Adjust view</h2>
          <p className="mt-0.5 text-[12px] text-[#5f6368]">
            {participantCount} participant{participantCount === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close adjust view"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] transition-colors hover:bg-black/[0.06] hover:text-[#202124]"
        >
          <X size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="rounded-[18px] bg-[#f8fafd] p-3">
          <h3 className="px-1 pb-2 text-[13px] font-medium text-[#3c4043]">
            Layout
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = settings.mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setMode(option.id)}
                  aria-pressed={selected}
                  className={`relative flex min-h-[76px] flex-col items-start justify-between rounded-[16px] border p-3 text-left transition-colors ${
                    selected
                      ? "border-[#1a73e8] bg-white"
                      : "border-transparent bg-[#edf3ff] hover:bg-[#e6efff]"
                  }`}
                >
                  <Icon
                    size={19}
                    strokeWidth={1.75}
                    className={selected ? "text-[#1a73e8]" : "text-[#5f6368]"}
                  />
                  <span className="text-[13px] font-medium text-[#202124]">
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a73e8] text-white">
                      <Check size={13} strokeWidth={2} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-4 rounded-[18px] bg-[#f8fafd] p-4">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="meet-max-tiles"
              className="text-[13px] font-medium text-[#3c4043]"
            >
              Maximum tiles
            </label>
            <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-[#202124]">
              {settings.maxTiles}
            </span>
          </div>
          <input
            id="meet-max-tiles"
            type="range"
            min={MEET_VIEW_MIN_TILES}
            max={MEET_VIEW_MAX_TILES}
            step={1}
            value={settings.maxTiles}
            onChange={(event) => commitMaxTilesValue(event.currentTarget.value)}
            onInput={(event) => commitMaxTilesValue(event.currentTarget.value)}
            onBlur={(event) => commitMaxTilesValue(event.currentTarget.value)}
            onPointerUp={(event) =>
              commitMaxTilesValue(event.currentTarget.value)
            }
            onKeyUp={(event) => commitMaxTilesValue(event.currentTarget.value)}
            className="mt-3 w-full accent-[#1a73e8]"
          />
        </section>

        <section className="mt-4 rounded-[18px] bg-[#f8fafd] p-2">
          <button
            type="button"
            role="switch"
            aria-checked={settings.hideTilesWithoutVideo}
            onClick={() =>
              setHideTilesWithoutVideo(!settings.hideTilesWithoutVideo)
            }
            className="flex w-full items-center justify-between gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-black/[0.04]"
          >
            <span className="text-[13px] font-medium text-[#202124]">
              Hide tiles without video
            </span>
            <span
              className={`relative h-6 w-10 rounded-full border transition-colors ${
                settings.hideTilesWithoutVideo
                  ? "border-[#1a73e8] bg-[#1a73e8]"
                  : "border-[#dadce0] bg-[#f1f3f4]"
              }`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                  settings.hideTilesWithoutVideo
                    ? "translate-x-[18px]"
                    : "translate-x-1"
                }`}
              />
            </span>
          </button>
        </section>

        <section className="mt-4 rounded-[18px] bg-[#f8fafd] p-3">
          <h3 className="px-1 pb-2 text-[13px] font-medium text-[#3c4043]">
            Your self-view
          </h3>
          <div
            className="grid grid-cols-2 gap-2"
            data-meet-self-view-options="true"
          >
            {SELF_VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = settings.selfViewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelfViewMode(option.id)}
                  aria-pressed={selected}
                  data-meet-self-view-option={option.id}
                  className={`relative flex min-h-[66px] flex-col items-start justify-between rounded-[16px] border p-3 text-left transition-colors ${
                    selected
                      ? "border-[#1a73e8] bg-white"
                      : "border-transparent bg-[#edf3ff] hover:bg-[#e6efff]"
                  }`}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.75}
                    className={selected ? "text-[#1a73e8]" : "text-[#5f6368]"}
                  />
                  <span className="text-[13px] font-medium text-[#202124]">
                    {option.label}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a73e8] text-white">
                      <Check size={13} strokeWidth={2} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </aside>
  );
}
