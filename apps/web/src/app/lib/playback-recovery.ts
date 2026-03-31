const DEFAULT_REPLAY_DELAYS_MS = [80, 220, 480, 900, 1500];
const MAX_ANIMATION_FRAME_REPLAYS = 24;

type PlaybackRecoverySchedulerOptions = {
  attemptPlayback: () => void;
  shouldAttemptAnimationFrameReplay?: () => boolean;
};

export const createPlaybackRecoveryScheduler = ({
  attemptPlayback,
  shouldAttemptAnimationFrameReplay,
}: PlaybackRecoverySchedulerOptions) => {
  const timeoutIds = new Set<number>();
  let animationFrameId: number | null = null;

  const clear = () => {
    timeoutIds.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    timeoutIds.clear();

    if (animationFrameId !== null) {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  const schedule = () => {
    clear();
    attemptPlayback();

    if (typeof window === "undefined") return;

    for (const delay of DEFAULT_REPLAY_DELAYS_MS) {
      const timeoutId = window.setTimeout(() => {
        timeoutIds.delete(timeoutId);
        attemptPlayback();
      }, delay);
      timeoutIds.add(timeoutId);
    }

    if (!shouldAttemptAnimationFrameReplay) return;

    let frameAttempts = 0;
    const replayOnFrame = () => {
      if (shouldAttemptAnimationFrameReplay()) {
        attemptPlayback();
      }

      frameAttempts += 1;
      if (frameAttempts < MAX_ANIMATION_FRAME_REPLAYS) {
        animationFrameId = window.requestAnimationFrame(replayOnFrame);
      } else {
        animationFrameId = null;
      }
    };

    animationFrameId = window.requestAnimationFrame(replayOnFrame);
  };

  return { clear, schedule };
};
