import { useCallback, useRef, useState, type MutableRefObject } from "react";

export type Viewport = {
  /** X translation in CSS pixels */
  translateX: number;
  /** Y translation in CSS pixels */
  translateY: number;
  /** Zoom scale factor (1 = 100%) */
  scale: number;
};

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 5;

export type ViewportControls = {
  viewport: Viewport;
  /** Convert a screen-space point to canvas-space (accounting for pan+zoom) */
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number };
  /** Pan by a delta in screen pixels */
  panBy: (dx: number, dy: number) => void;
  /** Zoom centred on a screen-space point */
  zoomAt: (screenX: number, screenY: number, factor: number) => void;
  /** Reset to 1:1 with no pan */
  resetViewport: () => void;
  /** Ref used to track pan drag state (internal) */
  panStartRef: MutableRefObject<{ x: number; y: number; tx: number; ty: number } | null>;
};

const DEFAULT_VIEWPORT: Viewport = { translateX: 0, translateY: 0, scale: 1 };

export function useViewport(): ViewportControls {
  const [viewport, setViewport] = useState<Viewport>({ ...DEFAULT_VIEWPORT });
  const panStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const screenToCanvas = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - viewport.translateX) / viewport.scale,
      y: (screenY - viewport.translateY) / viewport.scale,
    }),
    [viewport]
  );

  const panBy = useCallback((dx: number, dy: number) => {
    setViewport((prev) => ({
      ...prev,
      translateX: prev.translateX + dx,
      translateY: prev.translateY + dy,
    }));
  }, []);

  const zoomAt = useCallback((screenX: number, screenY: number, factor: number) => {
    setViewport((prev) => {
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
      if (nextScale === prev.scale) return prev;
      // Keep the point under the cursor fixed in canvas space
      const translateX = screenX - (screenX - prev.translateX) * (nextScale / prev.scale);
      const translateY = screenY - (screenY - prev.translateY) * (nextScale / prev.scale);
      return { translateX, translateY, scale: nextScale };
    });
  }, []);

  const resetViewport = useCallback(() => {
    setViewport({ ...DEFAULT_VIEWPORT });
  }, []);

  return { viewport, screenToCanvas, panBy, zoomAt, resetViewport, panStartRef };
}
