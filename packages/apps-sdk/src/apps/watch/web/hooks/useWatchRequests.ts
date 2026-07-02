import { useCallback, useEffect, useRef, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { getWatchRequestResolution } from "../../core/doc/index";

const AWARENESS_FIELD = "watchRequest";
const DECLINED_NOTE_MS = 4_000;

export type WatchRequest = {
  id: string;
  videoId: string;
  title: string | null;
  byId: string | null;
  byName: string | null;
};

type UseWatchRequestsArgs = {
  doc: Y.Doc;
  awareness: Awareness;
  self: { id: string | null; name: string | null };
};

const parseRequest = (value: unknown): WatchRequest | null => {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.videoId !== "string") {
    return null;
  }
  return {
    id: record.id,
    videoId: record.videoId,
    title: typeof record.title === "string" ? record.title : null,
    byId: typeof record.byId === "string" ? record.byId : null,
    byName: typeof record.byName === "string" ? record.byName : null,
  };
};

/**
 * Queue requests for participants without control permission. The pending
 * request rides the requester's AWARENESS state (which the room lock does not
 * block, and which naturally disappears with them), while the host's decision
 * arrives back through the doc's resolution markers. This hook serves both
 * roles: everyone reads the live request list; a requester submits, cancels,
 * and auto-clears when resolved.
 */
export function useWatchRequests({ doc, awareness, self }: UseWatchRequestsArgs) {
  const [requests, setRequests] = useState<WatchRequest[]>([]);
  const [myRequest, setMyRequest] = useState<WatchRequest | null>(null);
  const [declined, setDeclined] = useState(false);
  const myRequestRef = useRef<WatchRequest | null>(null);
  myRequestRef.current = myRequest;

  // Live request list from every participant's awareness state.
  useEffect(() => {
    const snapshot = () => {
      const next: WatchRequest[] = [];
      for (const state of awareness.getStates().values()) {
        const request = parseRequest(
          (state as Record<string, unknown> | null)?.[AWARENESS_FIELD],
        );
        if (request) next.push(request);
      }
      next.sort((a, b) => a.id.localeCompare(b.id));
      setRequests(next);
    };
    snapshot();
    awareness.on("change", snapshot);
    return () => {
      awareness.off("change", snapshot);
    };
  }, [awareness]);

  // When the host resolves my request, clear the pending state; a decline gets
  // a short-lived note so the requester is not left guessing.
  useEffect(() => {
    const check = () => {
      const mine = myRequestRef.current;
      if (!mine) return;
      const resolution = getWatchRequestResolution(doc, mine.id);
      if (!resolution) return;
      awareness.setLocalStateField(AWARENESS_FIELD, null);
      setMyRequest(null);
      if (resolution === "declined") {
        setDeclined(true);
      }
    };
    check();
    doc.on("update", check);
    return () => {
      doc.off("update", check);
    };
  }, [awareness, doc]);

  useEffect(() => {
    if (!declined) return;
    const timer = setTimeout(() => setDeclined(false), DECLINED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [declined]);

  // Leaving the app withdraws any pending request.
  useEffect(() => {
    return () => {
      awareness.setLocalStateField(AWARENESS_FIELD, null);
    };
  }, [awareness]);

  const submitRequest = useCallback(
    (videoId: string, title?: string | null) => {
      const request: WatchRequest = {
        id: `wr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        videoId,
        title: title ?? null,
        byId: self.id,
        byName: self.name,
      };
      awareness.setLocalStateField(AWARENESS_FIELD, request);
      setMyRequest(request);
      setDeclined(false);
    },
    [awareness, self.id, self.name],
  );

  const cancelRequest = useCallback(() => {
    awareness.setLocalStateField(AWARENESS_FIELD, null);
    setMyRequest(null);
  }, [awareness]);

  return { requests, myRequest, declined, submitRequest, cancelRequest };
}
