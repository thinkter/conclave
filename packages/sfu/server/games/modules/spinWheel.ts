import {
  GameMoveError,
  type GameContext,
  type GameModule,
  type GameMove,
} from "../types.js";
import { requirePlayerTarget } from "../validation.js";

/**
 * Spin the Wheel: a shared prize wheel seeded with everyone in the meet. The
 * host can tick players in or out before spinning; the server alone picks the
 * winner (via the seeded RNG) and hands every client the exact resting angle,
 * so the wheel animation always lands on the same name for the whole room.
 */

const SPIN_DURATION_MS = 4_200;

type Phase = "idle" | "spinning";

type SpinWheelState = {
  phase: Phase;
  /** false = excluded from the wheel; absent or true = included. */
  included: Record<string, boolean>;
  /** Bumped on every spin so clients can detect a fresh spin to animate. */
  spinId: number;
  /** Server-clock moment the current spin resolves; 0 while idle. */
  spinDeadline: number;
  spinDurationMs: number;
  /** Resting rotation (degrees, [0, 360)) that lines the pointer up with the winner. */
  targetRotationDeg: number;
  winnerId: string | null;
};

const isIncluded = (state: SpinWheelState, playerId: string): boolean =>
  state.included[playerId] !== false;

const eligiblePlayers = (state: SpinWheelState, ctx: GameContext) =>
  ctx.players.filter((player) => isIncluded(state, player.id));

/**
 * Typed move contract. Decoded from the untrusted `GameMove` at the top of
 * `onMove`. The toggle target stays `unknown` on the decoded move because it
 * is validated against the live roster by `requirePlayerTarget` (which needs
 * ctx) inside the case, preserving the "Invalid player" message.
 */
export type SpinWheelMove =
  | { type: "toggle"; target: unknown }
  | { type: "spin" };

const decodeSpinWheelMove = (move: GameMove): SpinWheelMove => {
  switch (move.type) {
    case "spin":
      return { type: "spin" };
    case "toggle":
      return { type: "toggle", target: (move.payload as { target?: unknown } | null)?.target };
    default:
      throw new GameMoveError(`Unknown move: ${move.type}`);
  }
};

export const spinWheelModule: GameModule<SpinWheelState> = {
  id: "spin-wheel",
  name: "Spin the Wheel",
  description: "Tick who's in, then spin to pick someone at random",
  minPlayers: 2,
  maxPlayers: 50,
  lateJoinPhases: ["idle"],
  tickMs: 200,

  setup(): SpinWheelState {
    return {
      phase: "idle",
      included: {},
      spinId: 0,
      spinDeadline: 0,
      spinDurationMs: SPIN_DURATION_MS,
      targetRotationDeg: 0,
      winnerId: null,
    };
  },

  onMove(state, move: GameMove, ctx): SpinWheelState {
    const m = decodeSpinWheelMove(move);
    switch (m.type) {
      case "toggle": {
        if (!ctx.isAdmin(move.playerId)) {
          throw new GameMoveError("Only the host can edit the wheel");
        }
        if (state.phase === "spinning") {
          throw new GameMoveError("Wheel is spinning");
        }
        const target = requirePlayerTarget(ctx, move.playerId, m.target, {
          invalidMessage: "Invalid player",
        });
        return {
          ...state,
          included: { ...state.included, [target]: !isIncluded(state, target) },
        };
      }
      case "spin": {
        if (!ctx.isAdmin(move.playerId)) {
          throw new GameMoveError("Only the host can spin");
        }
        if (state.phase === "spinning") {
          throw new GameMoveError("Already spinning");
        }
        const eligible = eligiblePlayers(state, ctx);
        if (eligible.length < 2) {
          throw new GameMoveError("Need at least 2 names on the wheel");
        }
        const winner = ctx.rng.pick(eligible);
        const winnerIndex = eligible.findIndex((p) => p.id === winner.id);
        const segmentDeg = 360 / eligible.length;
        // Small jitter keeps the pointer from landing dead-center every time
        // without ever crossing into a neighboring segment.
        const jitter = (ctx.rng.next() - 0.5) * segmentDeg * 0.6;
        const segmentCenterDeg = winnerIndex * segmentDeg + segmentDeg / 2 + jitter;
        const targetRotationDeg = (((360 - segmentCenterDeg) % 360) + 360) % 360;
        return {
          ...state,
          phase: "spinning",
          spinId: state.spinId + 1,
          spinDeadline: ctx.now + state.spinDurationMs,
          targetRotationDeg,
          winnerId: winner.id,
        };
      }
      default: {
        const _exhaustive: never = m;
        throw new GameMoveError(`Unknown move: ${(_exhaustive as GameMove).type}`);
      }
    }
  },

  onTick(state, ctx): SpinWheelState {
    if (state.phase === "spinning" && ctx.now >= state.spinDeadline) {
      return { ...state, phase: "idle" };
    }
    return state;
  },

  getPhase: (state) => state.phase,

  publicView(state, ctx) {
    const players = ctx.players.map((player) => ({
      id: player.id,
      name: player.name,
      included: isIncluded(state, player.id),
    }));
    return {
      phase: state.phase,
      serverNow: ctx.now,
      players,
      eligibleCount: players.filter((p) => p.included).length,
      spinId: state.spinId,
      spinDeadline: state.phase === "spinning" ? state.spinDeadline : null,
      spinDurationMs: state.spinDurationMs,
      targetRotationDeg: state.targetRotationDeg,
      winnerId: state.winnerId,
      winnerName:
        state.winnerId != null
          ? (ctx.players.find((p) => p.id === state.winnerId)?.name ?? null)
          : null,
    };
  },

  playerView() {
    return {};
  },

  isFinished: () => false,
};
