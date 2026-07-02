import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { getQueue, getVideoId, getVideoTitle } from "../../core/doc/index";
import type { QueueItem } from "../../core/model/types";

type WatchDocState = {
  videoId: string | null;
  videoTitle: string | null;
  queue: QueueItem[];
};

/**
 * Reactively read the durable Watch doc fields the React tree renders: the
 * current video (id + title) and the queue. Playback timing lives in
 * useSyncedPlayback; this hook only tracks the content that changes the layout.
 */
export function useWatchDocState(doc: Y.Doc): WatchDocState {
  const [state, setState] = useState<WatchDocState>(() => ({
    videoId: getVideoId(doc),
    videoTitle: getVideoTitle(doc),
    queue: getQueue(doc),
  }));

  useEffect(() => {
    const sync = () => {
      setState({
        videoId: getVideoId(doc),
        videoTitle: getVideoTitle(doc),
        queue: getQueue(doc),
      });
    };
    sync();
    doc.on("update", sync);
    return () => {
      doc.off("update", sync);
    };
  }, [doc]);

  return state;
}
