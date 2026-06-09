"use client";

import { Ghost, Hand, Link2, MicOff, UserPlus, Users } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSmartParticipantOrder } from "../hooks/useSmartParticipantOrder";
import type { Participant } from "../lib/types";
import { isSystemUserId, truncateDisplayName } from "../lib/utils";
import ParticipantAudio from "./ParticipantAudio";
import ParticipantVideo from "./ParticipantVideo";
import { avatarColor } from "@conclave/ui-tokens";
import { computeGridLayout } from "@conclave/meeting-core";

interface GridLayoutProps {
  localStream: MediaStream | null;
  isCameraOff: boolean;
  isMuted: boolean;
  isHandRaised: boolean;
  isGhost: boolean;
  participants: Map<string, Participant>;
  userEmail: string;
  isMirrorCamera: boolean;
  activeSpeakerId: string | null;
  currentUserId: string;
  audioOutputDeviceId?: string;
  isAdmin?: boolean;
  selectedParticipantId?: string | null;
  onParticipantClick?: (userId: string) => void;
  onOpenParticipantsPanel?: () => void;
  getDisplayName: (userId: string) => string;
  /** px the stage reserves on the right for a docked side panel (0 when none).
   *  Drives the one-shot reflow glide: when this changes, the grid re-measures
   *  synchronously and FLIPs every tile to its new size/position. */
  sidePanelReserve?: number;
}

const MAX_GRID_TILES = 16;
// Keep this many just-past-the-cutoff participants' <video> mounted (hidden but
// still decoding) as SIBLINGS of the visible grid tiles. When the active-speaker
// sort promotes one of them across the overflow boundary, React reconciles it by
// key within the same parent — the tile REPOSITIONS in place instead of
// unmount+remounting, so the decoder isn't reset and the tile doesn't black-flash.
const WARM_BUFFER_TILES = 4;
// Spacing of the measured stage. GRID_PADDING mirrors `p-4`; GRID_GAP is the
// inter-tile gap fed to the Meet packer so it reserves the same gutters we draw.
const GRID_PADDING = 16;
const GRID_GAP = 12;
const GRID_MAX_COLS = 6;
const FLIP_DURATION_MS = 220;
// Discrete side-panel reflow glides over the SAME duration/easing as the panel
// slide (meet-panel-in) so the stage and the panel move together.
const REFLOW_DURATION_MS = 280;
const FLIP_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FONT_SANS = "'PolySans Trial', system-ui, sans-serif";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * No-dependency FLIP. Keeps every tile gliding smoothly (position AND size)
 * when the grid reflows — both from participant identity/order changes
 * (join/leave, active-speaker reorder) AND from a discrete side-panel toggle —
 * WITHOUT remounting the tiles or resizing the live <video> every frame.
 *
 * The whole point: a tile's LAYOUT box (width/height) is set to its FINAL value
 * exactly once (so the <video> surface layout-resizes once, never per frame),
 * and the visual delta is animated purely as a GPU-composited transform —
 * `translate3d(dx,dy,0) scale(sx,sy)` easing to identity, transform-origin 0 0.
 * Per codex/browser-engineering: transform-scaling a composited <video> is GPU
 * RESAMPLING of the already-decoded texture, NOT a per-frame re-raster — it does
 * not flicker. The flicker we saw earlier came from animating layout width/height
 * (the padding transition driving computeGridLayout every frame), not from scale.
 *
 * `reflowNonce` is a value that changes ONLY on a discrete reflow we want to
 * animate (a side-panel open/close). A continuous window-drag resize changes the
 * layout but NOT the nonce, so it just snaps (no per-frame transform thrash).
 */
function useFlip(
  flipKeys: string[],
  layoutSignature: string,
  enabled: boolean,
  reflowNonce: number,
) {
  const nodeMap = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  const prevIdentitySignature = useRef<string | null>(null);
  const prevReflowNonce = useRef(reflowNonce);
  // Steady-state "first" rects captured the instant a panel toggle is detected,
  // held until the new layout settles (a frame later) so the glide starts from
  // the pre-reflow geometry, never the half-resized intermediate.
  const pendingReflowFirst = useRef<Map<string, DOMRect> | null>(null);
  const frameIds = useRef<number[]>([]);
  const signature = flipKeys.join("~");

  const register = useCallback((key: string, node: HTMLElement | null) => {
    if (node) nodeMap.current.set(key, node);
    else nodeMap.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    const cancelPendingFrames = () => {
      frameIds.current.forEach((frameId) => window.cancelAnimationFrame(frameId));
      frameIds.current = [];
    };
    cancelPendingFrames();

    if (!enabled) {
      prevRects.current = new Map();
      prevIdentitySignature.current = null;
      pendingReflowFirst.current = null;
      prevReflowNonce.current = reflowNonce;
      return;
    }

    const nodes = nodeMap.current;
    const reduced = prefersReducedMotion();

    // One rect read per node — reused for the delta diff and the next snapshot.
    const next = new Map<string, DOMRect>();
    nodes.forEach((node, key) => next.set(key, node.getBoundingClientRect()));

    // --- discrete panel-toggle reflow: stash steady-state rects, defer play ---
    if (prevReflowNonce.current !== reflowNonce) {
      prevReflowNonce.current = reflowNonce;
      // The final tile sizes land in the NEXT (synchronous, pre-paint) commit —
      // capture the geometry from BEFORE the reflow now, and play once it lands.
      pendingReflowFirst.current = prevRects.current;
      prevRects.current = next;
      // If no size/position actually changes (e.g. height-constrained grid), the
      // settle commit never fires — drop the stale pending next frame.
      const dropId = requestAnimationFrame(() => {
        pendingReflowFirst.current = null;
      });
      frameIds.current.push(dropId);
      return cancelPendingFrames;
    }

    const identityChanged =
      prevIdentitySignature.current !== null &&
      prevIdentitySignature.current !== signature;

    // Pick the FLIP source: a settled panel reflow, or an identity/order change.
    let firstRects: Map<string, DOMRect> | null = null;
    let duration = FLIP_DURATION_MS;
    if (pendingReflowFirst.current) {
      // Prefer the steady-state pre-reflow rects even when identity ALSO changed
      // this commit (a join mid-reflow) — `prevRects` currently holds the
      // half-resized intermediate, which would make tiles glide from the wrong
      // start. New tiles (no pending rect) simply skip and appear in place.
      firstRects = pendingReflowFirst.current;
      duration = REFLOW_DURATION_MS;
    } else if (identityChanged) {
      firstRects = prevRects.current;
    }
    pendingReflowFirst.current = null;

    if (firstRects && !reduced) {
      nodes.forEach((node, key) => {
        const oldRect = firstRects.get(key);
        const newRect = next.get(key);
        if (!oldRect || !newRect || newRect.width === 0 || newRect.height === 0) {
          node.style.transition = "none";
          node.style.transform = "";
          return;
        }
        const dx = oldRect.left - newRect.left;
        const dy = oldRect.top - newRect.top;
        const sx = oldRect.width / newRect.width;
        const sy = oldRect.height / newRect.height;
        // Skip imperceptible deltas (sub-pixel jitter).
        if (
          Math.abs(dx) < 1 &&
          Math.abs(dy) < 1 &&
          Math.abs(sx - 1) < 0.01 &&
          Math.abs(sy - 1) < 0.01
        ) {
          node.style.transition = "none";
          node.style.transform = "";
          return;
        }
        // 1. Invert: place the tile at its OLD box via a GPU transform. Origin
        //    0 0 (top-left) — FLIP math requires it. translate THEN scale.
        node.style.transition = "none";
        node.style.transformOrigin = "0 0";
        node.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
        // 2. Play: next frame, ease the transform back to identity. Only the
        //    composited transform animates — the <video> layout box does not.
        const frameId = requestAnimationFrame(() => {
          node.style.transition = `transform ${duration}ms ${FLIP_EASING}`;
          node.style.transform = "translate3d(0, 0, 0) scale(1, 1)";
        });
        frameIds.current.push(frameId);
      });
    } else {
      // First paint / pure window resize / reduced motion: snap, no animation.
      nodes.forEach((node) => {
        node.style.transition = "none";
        node.style.transform = "";
        node.style.transformOrigin = "";
      });
    }

    prevRects.current = next;
    prevIdentitySignature.current = signature;
    return cancelPendingFrames;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, layoutSignature, enabled, reflowNonce]);

  return register;
}

function GridLayout({
  localStream,
  isCameraOff,
  isMuted,
  isHandRaised,
  isGhost,
  participants,
  userEmail,
  isMirrorCamera,
  activeSpeakerId,
  currentUserId,
  audioOutputDeviceId,
  isAdmin = false,
  selectedParticipantId,
  onParticipantClick,
  onOpenParticipantsPanel,
  getDisplayName,
  sidePanelReserve = 0,
}: GridLayoutProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");
  const [inviteStatus, setInviteStatus] = useState<"idle" | "shared" | "copied">(
    "idle"
  );
  const copyTimeoutRef = useRef<number | null>(null);
  const inviteTimeoutRef = useRef<number | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const togglePin = useCallback(
    (userId: string) => setPinnedId((prev) => (prev === userId ? null : userId)),
    [],
  );
  const isLocalActiveSpeaker = activeSpeakerId === currentUserId;
  const maxRemoteWithoutOverflow = Math.max(0, MAX_GRID_TILES - 1);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) return;

    if (!localStream) {
      if (video.srcObject) {
        video.srcObject = null;
      }
      return;
    }

    if (video.srcObject !== localStream) {
      video.srcObject = localStream;
    }

    video.play().catch((err) => {
      if (err.name !== "AbortError") {
        console.error("[Meets] Grid local video play error:", err);
      }
    });
  }, [localStream]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      if (inviteTimeoutRef.current) {
        window.clearTimeout(inviteTimeoutRef.current);
      }
    };
  }, []);

  // Memoize the filtered input so it only changes identity when `participants`
  // actually changes — otherwise a fresh array every render defeats
  // useSmartParticipantOrder's internal memoization (new sorted array each tick).
  const remoteInput = useMemo(
    () =>
      Array.from(participants.values()).filter(
        (participant) =>
          !isSystemUserId(participant.userId) &&
          participant.userId !== currentUserId
      ),
    [participants, currentUserId]
  );
  const orderedRemoteParticipants = useSmartParticipantOrder(
    remoteInput,
    activeSpeakerId
  );
  const pinnedParticipant = pinnedId
    ? orderedRemoteParticipants.find((p) => p.userId === pinnedId) ?? null
    : null;
  useEffect(() => {
    if (pinnedId && !orderedRemoteParticipants.some((p) => p.userId === pinnedId)) {
      setPinnedId(null);
    }
  }, [pinnedId, orderedRemoteParticipants]);
  const hasOverflow = orderedRemoteParticipants.length > maxRemoteWithoutOverflow;
  const isSolo = orderedRemoteParticipants.length === 0;
  const maxVisibleRemoteParticipants = hasOverflow
    ? isOverflowOpen
      ? maxRemoteWithoutOverflow
      : Math.max(0, MAX_GRID_TILES - 2)
    : maxRemoteWithoutOverflow;
  const visibleParticipants = useMemo(() => {
    if (maxVisibleRemoteParticipants <= 0) {
      return [];
    }

    return orderedRemoteParticipants.slice(0, maxVisibleRemoteParticipants);
  }, [orderedRemoteParticipants, maxVisibleRemoteParticipants]);

  const hiddenParticipants = useMemo(() => {
    const visibleIds = new Set(
      visibleParticipants.map((participant) => participant.userId)
    );
    return orderedRemoteParticipants.filter(
      (participant) => !visibleIds.has(participant.userId)
    );
  }, [orderedRemoteParticipants, visibleParticipants]);
  const hiddenParticipantsCount = hiddenParticipants.length;
  // The few hidden participants just past the visible cutoff that we keep warm
  // (mounted + decoding, but visually hidden) so they cross the boundary without
  // a remount. Empty while the overflow gallery is open — it already renders
  // every hidden participant, so warming them too would double-mount the tile.
  const warmParticipants = useMemo(() => {
    if (isOverflowOpen) return [];
    const warm = hiddenParticipants.slice(0, WARM_BUFFER_TILES);
    // Also warm the active speaker even if they're hidden BEYOND the buffer —
    // useSmartParticipantOrder will promote them into the grid after the debounce
    // and we don't want that to mount a cold <video>.
    if (
      activeSpeakerId &&
      !warm.some((p) => p.userId === activeSpeakerId)
    ) {
      const speaker = hiddenParticipants.find(
        (p) => p.userId === activeSpeakerId,
      );
      if (speaker) warm.push(speaker);
    }
    return warm;
  }, [isOverflowOpen, hiddenParticipants, activeSpeakerId]);
  const showOverflowTile = hiddenParticipantsCount > 0;
  const showOverflowTileInGrid = showOverflowTile && !isOverflowOpen;
  const totalParticipants =
    visibleParticipants.length + 1 + (showOverflowTileInGrid ? 1 : 0);
  const overflowPreviewParticipants = hiddenParticipants.slice(0, 4);

  useEffect(() => {
    if (!showOverflowTile) {
      setIsOverflowOpen(false);
    }
  }, [showOverflowTile]);

  useEffect(() => {
    if (!isOverflowOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOverflowOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOverflowOpen]);

  const localDisplayName = getDisplayName(currentUserId);

  // Measure the stage so the Meet packer can size tiles to the actual viewport.
  // We track the border-box and subtract padding ourselves (one source of truth
  // with the rendered `p-4`), so initial sync measurement + observer agree.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      // Round to integers so sub-pixel ResizeObserver jitter never re-keys the
      // layout memo / FLIP signature (computeGridLayout floors anyway).
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setGridSize((prev) =>
        prev.width === width && prev.height === height
          ? prev
          : { width, height }
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // When a side panel toggles, the stage's reserved width changes INSTANTLY (the
  // pane's padding snaps). Re-measure SYNCHRONOUSLY here — in the same commit,
  // before the browser paints — so the tiles reach their final size this frame
  // (no half-resized intermediate flash) and the FLIP's first/last capture is
  // clean. The async ResizeObserver above would otherwise land a frame later.
  const prevReserveRef = useRef(sidePanelReserve);
  useLayoutEffect(() => {
    if (prevReserveRef.current === sidePanelReserve) return;
    prevReserveRef.current = sidePanelReserve;
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    setGridSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, [sidePanelReserve]);

  // Optimal-packing grid (shared @conclave/meeting-core engine — same logic web,
  // RN, and the Swift port use). Tiles are sized exactly; flex-wrap + content-
  // center gives Meet's centered last row for free.
  const layout = useMemo(
    () =>
      computeGridLayout(
        totalParticipants,
        Math.max(0, gridSize.width - GRID_PADDING * 2),
        Math.max(0, gridSize.height - GRID_PADDING * 2),
        {
          gap: GRID_GAP,
          maxCols: GRID_MAX_COLS,
          maxTilesPerPage: MAX_GRID_TILES,
          targetAspect: 16 / 9,
        }
      ),
    [totalParticipants, gridSize.width, gridSize.height]
  );
  const tileStyle =
    layout.tileWidth > 0
      ? { width: layout.tileWidth, height: layout.tileHeight }
      : undefined;
  const tileClass = layout.tileWidth > 0
    ? "relative shrink-0 will-change-transform"
    : "relative h-full w-full will-change-transform";
  // Include the measured stage size so a panel toggle that shifts tile POSITION
  // (the centered group re-centers) WITHOUT changing tile SIZE still re-runs the
  // FLIP effect on the settle commit — otherwise the pending reflow would be
  // dropped and the tiles would snap instead of glide.
  const layoutSignature = `${layout.cols}x${layout.rows}-${layout.tileWidth}x${layout.tileHeight}-${gridSize.width}x${gridSize.height}`;
  const hasMeasuredGrid = gridSize.width > 0 && gridSize.height > 0;

  const localSpeakerHighlight = isLocalActiveSpeaker ? "speaking" : "";
  const localHandRaisedHighlight = isHandRaised ? "!border-amber-400/60" : "";

  // Stable FLIP keys, in render order. Identity/order changes animate; pure
  // layout size changes only refresh the FLIP snapshot, so panel/window resizes
  // never run every tile through a transform animation.
  const flipKeys = useMemo(() => {
    const keys = ["local", ...visibleParticipants.map((p) => p.userId)];
    if (showOverflowTileInGrid) keys.push("overflow");
    return keys;
  }, [visibleParticipants, showOverflowTileInGrid]);
  const registerTile = useFlip(
    flipKeys,
    layoutSignature,
    hasMeasuredGrid,
    sidePanelReserve,
  );

  // Stable per-key ref callbacks. Inline `ref={(node) => registerTile(key, node)}`
  // creates a NEW function every render, so React detaches+reattaches the ref
  // (registerTile(null) then registerTile(node)) on every grid re-render — pure
  // churn on the hot video-tile path. Caching one callback per key makes the ref
  // identity stable so React leaves it alone unless the node actually changes.
  const tileRefCbs = useRef(new Map<string, (node: HTMLElement | null) => void>());
  const getTileRef = useCallback(
    (key: string) => {
      const cache = tileRefCbs.current;
      let cb = cache.get(key);
      if (!cb) {
        cb = (node: HTMLElement | null) => registerTile(key, node);
        cache.set(key, cb);
      }
      return cb;
    },
    [registerTile],
  );

  const copyToClipboard = async (value: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  };

  const handleCopyLink = async () => {
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    try {
      await copyToClipboard(window.location.href);
      setCopyStatus("copied");
    } catch (error) {
      console.error("[Meets] Failed to copy meeting link:", error);
      setCopyStatus("copied");
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 2000);
  };

  const handleInvite = async () => {
    if (inviteTimeoutRef.current) {
      window.clearTimeout(inviteTimeoutRef.current);
    }
    const meetingLink = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Conclave meeting",
          text: "Join me in this Conclave room.",
          url: meetingLink,
        });
        setInviteStatus("shared");
      } else {
        await copyToClipboard(meetingLink);
        setInviteStatus("copied");
      }
    } catch (error) {
      return;
    }
    inviteTimeoutRef.current = window.setTimeout(() => {
      setInviteStatus("idle");
    }, 2400);
  };

  return (
    <div
      className="relative flex flex-1 min-h-0 flex-col"
      style={{ fontFamily: FONT_SANS }}
    >
      <div
        className="pointer-events-none h-0 w-0 overflow-hidden"
        aria-hidden={true}
      >
        {orderedRemoteParticipants.map((participant) => (
          <ParticipantAudio
            key={`audio-${participant.userId}`}
            participant={participant}
            audioOutputDeviceId={audioOutputDeviceId}
          />
        ))}
      </div>

      <div
        ref={gridRef}
        className={`flex flex-1 min-h-0 flex-wrap content-center justify-center overflow-hidden p-4 ${
          hasMeasuredGrid ? "opacity-100" : "opacity-0"
        }`}
        style={{ gap: GRID_GAP }}
      >
        {/* Local tile — wrapped in a stable FLIP node so the <video> never
            re-attaches when the grid reflows. */}
        <div
          ref={getTileRef("local")}
          className={tileClass}
          style={tileStyle}
        >
          <div
            className={`acm-video-tile h-full w-full ${localSpeakerHighlight} ${localHandRaisedHighlight}`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${
                isCameraOff ? "hidden" : ""
              } ${isMirrorCamera ? "scale-x-[-1]" : ""}`}
            />
            {isCameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#18181b]">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold text-white"
                  style={{ backgroundColor: avatarColor(userEmail) }}
                >
                  {(localDisplayName[0] || userEmail[0] || "?").toUpperCase()}
                </div>
              </div>
            )}
            {isGhost && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
                <div className="flex flex-col items-center gap-2.5">
                  <Ghost size={48} strokeWidth={1.75} className="text-[#FF007A]" />
                  <span className="rounded-full border border-[#FF007A]/30 bg-black/60 px-2.5 py-1 text-[12px] font-medium text-[#FF007A]">
                    Ghost mode
                  </span>
                </div>
              </div>
            )}
            {isHandRaised && (
              <div
                className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20 text-amber-300"
                title="Hand raised"
                aria-label="Hand raised"
              >
                <Hand size={18} strokeWidth={1.75} />
              </div>
            )}
            <div className="absolute bottom-3 left-3 flex max-w-[80%] items-center gap-1.5 rounded-full border border-[#fafafa]/10 bg-[#0a0a0b]/70 px-3 py-1.5">
              <span className="truncate text-[13px] font-medium text-[#fafafa]">
                {localDisplayName}
              </span>
              <span className="text-[11px] font-medium text-[#F95F4A]">You</span>
              {isMuted && (
                <MicOff size={14} strokeWidth={1.75} className="shrink-0 text-[#F95F4A]" />
              )}
            </div>
            {isSolo && !isCameraOff ? (
              // Camera is on — don't cover the live self-view with the full card;
              // show a compact corner invite pill instead.
              <button
                type="button"
                onClick={handleInvite}
                className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-[#fafafa]/14 bg-[#18181b] px-3.5 py-2 text-[13px] font-medium text-[#fafafa] transition-colors hover:bg-[#232327] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95F4A]/40"
              >
                <UserPlus size={16} strokeWidth={1.75} className="text-[#F95F4A]" />
                {inviteStatus === "shared"
                  ? "Invite sent"
                  : inviteStatus === "copied"
                  ? "Link copied"
                  : "Invite people"}
              </button>
            ) : isSolo ? (
              <div className="absolute left-3 top-3 w-[19rem] max-w-[calc(100%-1.5rem)] rounded-xl border border-[#fafafa]/12 bg-[#18181b] p-4 text-[#fafafa]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-[#fafafa]">
                    <Users size={18} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight">
                      You are the only one here
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-[#fafafa]/66">
                      Invite people to join this room.
                    </p>
                  </div>
                </div>
                <div className="mt-3.5 flex gap-2">
                  <button
                    type="button"
                    onClick={handleInvite}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#F95F4A] px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#fa6e5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F95F4A]/40"
                  >
                    <UserPlus size={18} strokeWidth={1.75} />
                    {inviteStatus === "shared"
                      ? "Invite sent"
                      : inviteStatus === "copied"
                      ? "Link copied"
                      : "Invite people"}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-[#fafafa]/14 bg-transparent px-3 py-2 text-[13px] font-medium text-[#fafafa]/85 transition-colors hover:bg-white/[0.05] hover:text-[#fafafa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fafafa]/20"
                  >
                    <Link2 size={18} strokeWidth={1.75} />
                    {copyStatus === "copied" ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {visibleParticipants.map((participant) => (
          <div
            key={participant.userId}
            ref={getTileRef(participant.userId)}
            data-userid={participant.userId}
            className={tileClass}
            style={tileStyle}
          >
            <ParticipantVideo
              participant={participant}
              displayName={getDisplayName(participant.userId)}
              isActiveSpeaker={activeSpeakerId === participant.userId}
              audioOutputDeviceId={audioOutputDeviceId}
              disableAudio
              isAdmin={isAdmin}
              isSelected={selectedParticipantId === participant.userId}
              onAdminClick={onParticipantClick}
              isPinned={pinnedId === participant.userId}
              onTogglePin={togglePin}
            />
          </div>
        ))}

        {showOverflowTileInGrid ? (
          <div
            key="overflow"
            ref={getTileRef("overflow")}
            className={tileClass}
            style={tileStyle}
          >
            <button
              type="button"
              onClick={() => setIsOverflowOpen((prev) => !prev)}
              aria-expanded={isOverflowOpen}
              aria-label={`Show ${hiddenParticipantsCount} more participants`}
              title={`Show ${hiddenParticipantsCount} more participants`}
              className="acm-video-tile group relative flex h-full w-full flex-col items-center justify-center bg-[#131316] text-[#fafafa] transition-colors hover:border-[#fafafa]/15"
            >
              <div className="absolute inset-3 grid grid-cols-2 grid-rows-2 gap-1.5 opacity-30 transition-opacity duration-200 group-hover:opacity-50">
                {overflowPreviewParticipants.map((participant) => (
                  <OverflowPreviewTile
                    key={participant.userId}
                    participant={participant}
                    displayName={getDisplayName(participant.userId)}
                  />
                ))}
              </div>
              <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
                <span className="text-[28px] font-semibold leading-none text-[#fafafa]">
                  +{hiddenParticipantsCount}
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-[#fafafa]/12 bg-[#0a0a0b]/70 px-2.5 py-1 text-[12.5px] font-medium text-[#fafafa]/85 transition-colors group-hover:text-[#fafafa]">
                  <Users size={18} strokeWidth={1.75} />
                  Show all
                </span>
              </div>
            </button>
          </div>
        ) : null}

        {/* Warm buffer — mounted but hidden (off-screen, still decoding) as
            SIBLINGS of the visible grid tiles. Stable key={userId} + same parent
            means a participant promoted across the overflow boundary by the
            active-speaker sort REPOSITIONS in place (React preserves the element
            by key) instead of unmount+remounting — no decoder reset / black
            flash. Skipped while the overflow gallery is open (it already renders
            every hidden tile). */}
        {warmParticipants.map((participant) => (
          <div
            key={participant.userId}
            aria-hidden
            className="pointer-events-none absolute overflow-hidden opacity-0"
            // Keep the warm wrapper at the SAME size it'll be in the grid (not
            // h-px w-px) — otherwise crossing the boundary forces a huge
            // compositor/video-layer resize from 1px → full tile. Just park it
            // far off-screen.
            style={{ ...(tileStyle ?? {}), left: -99999, top: 0 }}
          >
            <ParticipantVideo
              participant={participant}
              displayName={getDisplayName(participant.userId)}
              isActiveSpeaker={false}
              audioOutputDeviceId={audioOutputDeviceId}
              disableAudio
              isAdmin={isAdmin}
              isPinned={false}
              // No interactive controls on a warm (off-screen, aria-hidden) tile
              // — passing onTogglePin would render a focusable pin button that a
              // keyboard / screen reader could still reach inside aria-hidden.
              onTogglePin={undefined}
            />
          </div>
        ))}
      </div>

      {pinnedParticipant && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#0a0a0b] p-4">
          <div className="relative min-h-0 flex-1">
            <ParticipantVideo
              key={pinnedParticipant.userId}
              participant={pinnedParticipant}
              displayName={getDisplayName(pinnedParticipant.userId)}
              isActiveSpeaker={activeSpeakerId === pinnedParticipant.userId}
              disableAudio
              videoObjectFit="contain"
              isPinned
              onTogglePin={togglePin}
            />
          </div>
        </div>
      )}

      {showOverflowTile ? (
        <div
          className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
            isOverflowOpen
              ? "mt-3 max-h-64 opacity-100 pointer-events-auto"
              : "mt-0 max-h-0 opacity-0 pointer-events-none"
          }`}
        >
          <div className="relative w-full overflow-hidden rounded-xl border border-[#fafafa]/10 bg-[#18181b]">
            <div className="flex items-center justify-between border-b border-[#fafafa]/10 px-4 py-3">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-[#fafafa]">
                <Users size={18} strokeWidth={1.75} className="text-[#fafafa]/70" />
                More participants
                <span className="text-[13px] font-medium text-[#fafafa]/55">
                  {hiddenParticipantsCount}
                </span>
              </span>
              <div className="flex items-center gap-2">
                {onOpenParticipantsPanel ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOverflowOpen(false);
                      onOpenParticipantsPanel();
                    }}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#fafafa]/70 transition-colors hover:bg-white/[0.06] hover:text-[#fafafa]"
                  >
                    View all
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsOverflowOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#fafafa]/70 transition-colors hover:bg-white/[0.06] hover:text-[#fafafa]"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="relative">
              <div className="grid auto-cols-[11rem] grid-flow-col gap-3 overflow-x-scroll scroll-smooth snap-x snap-mandatory px-4 pb-4 pt-4 no-scrollbar">
                {/* Only MOUNT the gallery <video>s while the tray is actually
                    open. The wrapper above merely collapses them with max-h-0,
                    so without this guard every hidden participant kept decoding
                    video while the tray was closed — wasteful and a duplicate of
                    the warm buffer. Cold-mounting on open is fine (explicit
                    user action); the warm buffer covers the grid boundary. */}
                {isOverflowOpen &&
                  hiddenParticipants.map((participant) => (
                    <OverflowGalleryTile
                      key={participant.userId}
                      participant={participant}
                      displayName={getDisplayName(participant.userId)}
                      isActiveSpeaker={activeSpeakerId === participant.userId}
                      isAdmin={isAdmin}
                      onParticipantClick={onParticipantClick}
                    />
                  ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const OverflowPreviewTile = memo(function OverflowPreviewTile({
  participant,
  displayName,
}: {
  participant: Participant;
  displayName: string;
}) {
  // AVATAR-ONLY. This is a tiny 4-up hint inside the "+N" button; rendering a
  // live <video> here DUPLICATED the decode of the same hidden participants the
  // warm buffer already keeps mounted (double media attach per stream). A solid
  // avatar is all the preview needs.
  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-[#fafafa]/10 text-[13px] font-semibold text-white"
      style={{ backgroundColor: avatarColor(participant.userId) }}
    >
      {displayName[0]?.toUpperCase() || "?"}
    </div>
  );
});

const OverflowGalleryTile = memo(function OverflowGalleryTile({
  participant,
  displayName,
  isActiveSpeaker,
  isAdmin,
  onParticipantClick,
}: {
  participant: Participant;
  displayName: string;
  isActiveSpeaker: boolean;
  isAdmin: boolean;
  onParticipantClick?: (userId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStream = participant.isCameraOff ? null : participant.videoStream;
  const videoTrack = videoStream?.getVideoTracks()[0] ?? null;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!videoStream) {
      if (video.srcObject) {
        video.srcObject = null;
      }
      return;
    }

    if (video.srcObject !== videoStream) {
      video.srcObject = videoStream;
    }

    const playVideo = () => {
      video.play().catch(() => {});
    };

    playVideo();

    if (!videoTrack) return;
    videoTrack.addEventListener("unmute", playVideo);

    return () => {
      videoTrack.removeEventListener("unmute", playVideo);
    };
  }, [videoStream, videoTrack]);

  const showPlaceholder = !videoStream;
  const tileLabel = truncateDisplayName(displayName, 18);
  const isClickable = isAdmin && Boolean(onParticipantClick);
  const handleClick = () => {
    if (isClickable && onParticipantClick) {
      onParticipantClick(participant.userId);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!isClickable}
      title={displayName}
      className={`acm-video-tile group relative flex h-28 w-44 shrink-0 snap-start flex-col overflow-hidden text-left ${
        isActiveSpeaker ? "speaking" : ""
      } ${isClickable ? "cursor-pointer hover:border-[#F95F4A]/40" : "cursor-default opacity-85"}`}
    >
      <div className="relative h-full w-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`h-full w-full object-cover ${showPlaceholder ? "hidden" : ""}`}
        />
        {showPlaceholder && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-white"
            style={{ backgroundColor: avatarColor(participant.userId) }}
          >
            {tileLabel[0]?.toUpperCase() || "?"}
          </div>
        )}
        {participant.isGhost && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Ghost size={28} strokeWidth={1.75} className="text-[#FF007A]" />
          </div>
        )}
        {participant.isHandRaised && (
          <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/20 text-amber-300">
            <Hand size={18} strokeWidth={1.75} />
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex max-w-[85%] items-center gap-1.5 rounded-full border border-[#fafafa]/10 bg-[#0a0a0b]/70 px-2.5 py-1">
          <span className="truncate text-[12.5px] font-medium text-[#fafafa]">
            {tileLabel}
          </span>
          {participant.isMuted && (
            <MicOff size={14} strokeWidth={1.75} className="shrink-0 text-[#F95F4A]" />
          )}
        </div>
      </div>
    </button>
  );
});

export default memo(GridLayout);
