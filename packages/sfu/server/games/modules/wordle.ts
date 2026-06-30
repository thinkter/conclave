import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GameMoveError,
  type GameContext,
  type GameModule,
  type GameMove,
} from "../types.js";
import { numberOption } from "../config.js";

type WordleTile = "green" | "yellow" | "gray";

type Outcome = "win" | "lose" | "timeout";

type GuessResult = {
  playerId: string;
  word: string;
  feedback: WordleTile[];
  at: number;
};

type WordleState = {
  phase: "lobby" | "set-word" | "playing" | "results";
  setterId: string | null;
  targetWord: string | null;
  guesses: GuessResult[];
  maxTries: number;
  timeLimitMs: number;
  deadline: number;
  outcome: Outcome | null;
  winnerId: string | null;
};

const WORD_LENGTH = 5;
const MAX_TRIES = 6;

const moduleDir = dirname(fileURLToPath(import.meta.url));
const wordsPath = resolve(moduleDir, "wordleWords.json");
const WORD_SET = new Set<string>(
  (JSON.parse(readFileSync(wordsPath, "utf8")) as string[])
    .map((word) => word.trim().toUpperCase())
    .filter((word) => /^[A-Z]{5}$/.test(word)),
);

const setterName = (ctx: GameContext, setterId: string | null): string | null => {
  if (!setterId) return null;
  return ctx.players.find((player) => player.id === setterId)?.name ?? null;
};

const winnerName = (ctx: GameContext, winnerId: string | null): string | null => {
  if (!winnerId) return null;
  return ctx.players.find((player) => player.id === winnerId)?.name ?? null;
};

const normalizeWord = (value: unknown, options?: { role?: "guess" | "secret" }): string => {
  const label = options?.role === "secret" ? "Word" : "Guess";
  if (typeof value !== "string") {
    throw new GameMoveError(`${label} must be exactly 5 letters`);
  }
  const trimmed = value.trim();
  if (trimmed.length !== WORD_LENGTH) {
    throw new GameMoveError(`${label} must be exactly 5 letters`);
  }
  if (!/^[a-zA-Z]+$/.test(trimmed)) {
    throw new GameMoveError(`${label} must contain letters only`);
  }
  const normalized = trimmed.toUpperCase();
  if (!WORD_SET.has(normalized)) {
    throw new GameMoveError("Not in word list");
  }
  return normalized;
};

const evaluateGuess = (target: string, guess: string): WordleTile[] => {
  const feedback: WordleTile[] = ["gray", "gray", "gray", "gray", "gray"];
  const pool = target.split("");

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (guess[i] === target[i]) {
      feedback[i] = "green";
      pool[i] = "";
    }
  }

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (feedback[i] === "green") continue;
    const letter = guess[i];
    const poolIndex = pool.findIndex((candidate) => candidate === letter);
    if (poolIndex >= 0) {
      feedback[i] = "yellow";
      pool[poolIndex] = "";
    }
  }

  return feedback;
};

const isSolved = (feedback: WordleTile[]): boolean =>
  feedback.length === WORD_LENGTH && feedback.every((tile) => tile === "green");

export const wordleModule: GameModule<WordleState> = {
  id: "wordle",
  name: "Wordle",
  description: "Guess a hidden five-letter word in six tries",
  minPlayers: 2,
  maxPlayers: 32,
  tickMs: 500,
  options: [
    {
      id: "timeLimitMinutes",
      type: "number",
      label: "Time limit",
      min: 1,
      max: 10,
      default: 3,
      presets: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      suffix: "min",
    },
  ],

  setup(ctx: GameContext): WordleState {
    return {
      phase: "lobby",
      setterId: null,
      targetWord: null,
      guesses: [],
      maxTries: MAX_TRIES,
      timeLimitMs: numberOption(ctx.config, "timeLimitMinutes", 3) * 60_000,
      deadline: 0,
      outcome: null,
      winnerId: null,
    };
  },

  onMove(state, move: GameMove, ctx): WordleState {
    switch (move.type) {
      case "start": {
        if (!ctx.isAdmin(move.playerId)) {
          throw new GameMoveError("Only the host can start Wordle");
        }
        if (state.phase !== "lobby") {
          throw new GameMoveError("Wordle has already started");
        }
        if (ctx.players.length < 2) {
          throw new GameMoveError("Need at least 2 players");
        }
        const setter = ctx.rng.pick(ctx.players);
        return {
          ...state,
          phase: "set-word",
          setterId: setter.id,
          targetWord: null,
          guesses: [],
          deadline: 0,
          outcome: null,
          winnerId: null,
        };
      }
      case "setWord": {
        if (state.phase !== "set-word") {
          throw new GameMoveError("Word is already set");
        }
        if (!state.setterId || move.playerId !== state.setterId) {
          throw new GameMoveError("Only the selected player can set the word");
        }
        const word = normalizeWord((move.payload as { word?: unknown })?.word, {
          role: "secret",
        });
        return {
          ...state,
          phase: "playing",
          targetWord: word,
          guesses: [],
          deadline: ctx.now + state.timeLimitMs,
          outcome: null,
          winnerId: null,
        };
      }
      case "guess": {
        if (state.phase !== "playing") {
          throw new GameMoveError("Wordle is not accepting guesses right now");
        }
        if (!state.targetWord) {
          throw new GameMoveError("Word is not set yet");
        }
        if (state.setterId && move.playerId === state.setterId) {
          throw new GameMoveError("The selected player cannot submit guesses");
        }
        const guess = normalizeWord((move.payload as { word?: unknown })?.word, {
          role: "guess",
        });
        const feedback = evaluateGuess(state.targetWord, guess);
        const guesses = [
          ...state.guesses,
          {
            playerId: move.playerId,
            word: guess,
            feedback,
            at: ctx.now,
          },
        ];

        if (isSolved(feedback)) {
          return {
            ...state,
            phase: "results",
            guesses,
            outcome: "win",
            winnerId: move.playerId,
          };
        }

        if (guesses.length >= state.maxTries) {
          return {
            ...state,
            phase: "results",
            guesses,
            outcome: "lose",
            winnerId: null,
          };
        }

        return {
          ...state,
          guesses,
        };
      }
      default:
        throw new GameMoveError(`Unknown move: ${move.type}`);
    }
  },

  onTick(state, ctx): WordleState {
    if (state.phase === "playing" && state.deadline > 0 && ctx.now >= state.deadline) {
      return {
        ...state,
        phase: "results",
        outcome: "timeout",
        winnerId: null,
      };
    }
    return state;
  },

  getPhase: (state) => state.phase,

  publicView(state, ctx) {
    return {
      phase: state.phase,
      setterId: state.setterId,
      setterName: setterName(ctx, state.setterId),
      serverNow: ctx.now,
      deadline: state.phase === "playing" ? state.deadline : null,
      timeLimitMs: state.timeLimitMs,
      wordLength: WORD_LENGTH,
      maxTries: state.maxTries,
      triesUsed: state.guesses.length,
      triesLeft: Math.max(0, state.maxTries - state.guesses.length),
      guesses: state.guesses.map((entry) => ({
        playerId: entry.playerId,
        playerName:
          ctx.players.find((player) => player.id === entry.playerId)?.name ??
          "Unknown",
        word: entry.word,
        feedback: entry.feedback,
      })),
      result:
        state.phase === "results"
          ? {
              outcome: state.outcome,
              targetWord: state.targetWord,
              winnerId: state.winnerId,
              winnerName: winnerName(ctx, state.winnerId),
            }
          : null,
    };
  },

  playerView(state, playerId) {
    const isSetter = state.setterId === playerId;
    return {
      isSetter,
      canSetWord: state.phase === "set-word" && isSetter,
      canGuess: state.phase === "playing" && !isSetter,
      secretWord: isSetter || state.phase === "results" ? state.targetWord : null,
    };
  },

  isFinished: (state) => state.phase === "results",
};
