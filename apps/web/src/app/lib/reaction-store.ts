import type { ReactionEvent } from "./types";

/**
 * Reaction events are high-frequency and ephemeral (each one is added and then
 * removed ~4s later). Keeping them in React state at the meeting-client level
 * re-rendered the entire meeting tree twice per reaction, which made bursts of
 * reactions visibly lag the call UI. This store keeps them outside React;
 * only ReactionOverlay subscribes (via useSyncExternalStore), so reaction
 * traffic re-renders nothing but the overlay itself.
 */
export interface ReactionStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ReactionEvent[];
  add: (event: ReactionEvent) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function createReactionStore(maxReactions: number): ReactionStore {
  let snapshot: ReactionEvent[] = [];
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    add(event) {
      const next = [...snapshot, event];
      snapshot = next.length > maxReactions ? next.slice(-maxReactions) : next;
      emit();
    },
    remove(id) {
      if (!snapshot.some((item) => item.id === id)) return;
      snapshot = snapshot.filter((item) => item.id !== id);
      emit();
    },
    clear() {
      if (snapshot.length === 0) return;
      snapshot = [];
      emit();
    },
  };
}
