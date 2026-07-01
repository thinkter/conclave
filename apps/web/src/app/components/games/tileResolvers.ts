"use client";

/**
 * Per-game tile resolvers: how each game reads its public view into the shared
 * semantic PlayerTileState the SDK maps to visual primitives. This is the
 * configurable seam. Importing this module registers the resolvers once.
 *
 * Resolvers only read what a public view genuinely exposes and never invent
 * data. Leaderboard rank is applied universally by the overlay, so resolvers
 * only cover game-specific state (acted, outcome, eliminated, active, note).
 */

import { registerTileResolver, type PlayerTileState } from "@conclave/apps-sdk";

type TriviaTile = {
  acted?: boolean;
  outcome?: "correct" | "wrong";
  note?: string;
};

function readTriviaTiles(view: unknown): Record<string, TriviaTile> | null {
  if (!view || typeof view !== "object") return null;
  const tiles = (view as { tiles?: unknown }).tiles;
  if (!tiles || typeof tiles !== "object") return null;
  return tiles as Record<string, TriviaTile>;
}

registerTileResolver("trivia", ({ publicView, playerId }): PlayerTileState | null => {
  const mine = readTriviaTiles(publicView)?.[playerId];
  if (!mine) return null;
  const state: PlayerTileState = {};
  if (mine.acted) state.acted = true;
  if (mine.outcome) state.outcome = mine.outcome;
  if (mine.note) state.note = mine.note;
  return Object.keys(state).length > 0 ? state : null;
});

type ReactionResult = { id: string; early?: boolean };

function readReactionResults(view: unknown): ReactionResult[] | null {
  if (!view || typeof view !== "object") return null;
  const results = (view as { results?: unknown }).results;
  if (!Array.isArray(results)) return null;
  return results as ReactionResult[];
}

registerTileResolver("reaction", ({ publicView, playerId }): PlayerTileState | null => {
  const mine = readReactionResults(publicView)?.find((r) => r.id === playerId);
  if (mine?.early) return { eliminated: true, note: "Too soon" };
  return null;
});

function readImposterVotedOutId(view: unknown): string | null {
  if (!view || typeof view !== "object") return null;
  const result = (view as { result?: unknown }).result;
  if (!result || typeof result !== "object") return null;
  const id = (result as { votedOutId?: unknown }).votedOutId;
  return typeof id === "string" ? id : null;
}

registerTileResolver("imposter", ({ publicView, playerId }): PlayerTileState | null => {
  const votedOutId = readImposterVotedOutId(publicView);
  if (votedOutId && votedOutId === playerId) {
    return { eliminated: true, note: "Voted out" };
  }
  return null;
});
