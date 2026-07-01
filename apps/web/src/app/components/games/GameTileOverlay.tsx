"use client";

import { Check, Clock, Crown, Skull, X, Zap } from "lucide-react";
import {
  getTileResolver,
  resolveTileAdornment,
  useGame,
  type PlayerTileState,
  type TileMarkIcon,
  type TileTone,
} from "@conclave/apps-sdk";
import { accentFor } from "./covers";
import "./tileResolvers";

/**
 * Game adornments drawn on a participant video tile, so the video grid doubles
 * as the game board. This is a read-only consumer: it reads the game's public
 * view into a semantic PlayerTileState (via the game's registered resolver plus
 * a universal leaderboard rank), maps that to visual primitives through the SDK,
 * and draws them. Outside a game, or for a non-player, it renders nothing.
 *
 * ID MAPPING: a web participant.userId and a game player.id are the same
 * server-produced identity string (baseId#sessionId, lowercased). Tiles that
 * render this overlay are always remote peers whose userId comes straight from
 * the SFU snapshot, so exact equality is correct. Any unmatched id renders
 * nothing (fail safe) rather than guessing.
 */
const matchesPlayer = (userId: string, playerId: string): boolean =>
  userId === playerId;

type ScoreRow = { id: string; name: string; score: number };

function readScoreboard(view: unknown): ScoreRow[] | null {
  if (!view || typeof view !== "object") return null;
  const board = (view as { scoreboard?: unknown }).scoreboard;
  if (!Array.isArray(board)) return null;
  return board as ScoreRow[];
}

/**
 * Live leaderboard position via competition ranking (ties share a rank), only
 * once standings are meaningful (someone has scored). Applied to every
 * leaderboard game so resolvers do not each reimplement it.
 */
function rankFromScoreboard(view: unknown, userId: string): number | undefined {
  const board = readScoreboard(view);
  const row = board?.find((entry) => matchesPlayer(userId, entry.id));
  if (!board || !row || typeof row.score !== "number") return undefined;
  const top = Math.max(
    0,
    ...board.map((e) => (typeof e.score === "number" ? e.score : 0)),
  );
  if (top <= 0) return undefined;
  const ahead = board.filter(
    (e) => (typeof e.score === "number" ? e.score : 0) > row.score,
  ).length;
  return 1 + ahead;
}

const MARK_ICON: Record<TileMarkIcon, typeof Check> = {
  check: Check,
  cross: X,
  crown: Crown,
  bolt: Zap,
  clock: Clock,
  skull: Skull,
};

const POSITIVE_COLOR = "#2FA96B";
const NEGATIVE_COLOR = "#E0603A";

function toneColor(tone: TileTone, accent: string): string {
  switch (tone) {
    case "accent":
      return accent;
    case "positive":
      return POSITIVE_COLOR;
    case "negative":
      return NEGATIVE_COLOR;
    default:
      return "#fafafa";
  }
}

interface GameTileOverlayProps {
  userId: string;
  compact?: boolean;
}

export default function GameTileOverlay({
  userId,
  compact = false,
}: GameTileOverlayProps) {
  const { publicState, userId: viewerId } = useGame();

  if (!publicState) return null;
  const isPlayer = publicState.players.some((player) =>
    matchesPlayer(userId, player.id),
  );
  if (!isPlayer) return null;

  const accent = accentFor(publicState.gameId);

  // Game-specific semantic state from the registered resolver, plus a universal
  // leaderboard rank merged on top.
  const resolver = getTileResolver(publicState.gameId);
  const resolved = resolver
    ? resolver({
        gameId: publicState.gameId,
        publicView: publicState.view,
        playerId: userId,
        viewerId,
      })
    : null;
  const rank =
    publicState.hasLeaderboard && publicState.phase !== "lobby"
      ? rankFromScoreboard(publicState.view, userId)
      : undefined;

  const state: PlayerTileState = { ...(resolved ?? {}) };
  if (rank !== undefined) state.rank = rank;
  if (Object.keys(state).length === 0) return null;

  const adornment = resolveTileAdornment(state, accent);
  if (!adornment) return null;

  const centerMark =
    adornment.mark && adornment.mark.emphasis === "center" ? adornment.mark : null;
  const cornerMark =
    adornment.mark && adornment.mark.emphasis !== "center" ? adornment.mark : null;
  const badge = adornment.badge;

  const CenterIcon = centerMark ? MARK_ICON[centerMark.icon] : null;
  const CornerIcon = cornerMark ? MARK_ICON[cornerMark.icon] : null;

  // The bottom-right chip merges a corner mark and the badge into one pill. It
  // fills with the accent for accent-toned content, otherwise a neutral dark
  // chip that mirrors the tile's name label.
  const showChip = Boolean(cornerMark || badge);
  const chipIsAccent =
    badge?.tone === "accent" || (!badge && cornerMark?.tone === "accent");
  const badgeTextColor =
    !badge || chipIsAccent || badge.tone === "neutral"
      ? undefined
      : toneColor(badge.tone, accent);

  return (
    <div className="pointer-events-none absolute inset-0 z-[1]">
      {adornment.fill ? (
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            backgroundColor: adornment.fill.color,
            opacity: adornment.fill.opacity,
          }}
        />
      ) : null}
      {adornment.dim ? (
        <div className="absolute inset-0 rounded-[inherit] bg-black/45" />
      ) : null}
      {adornment.ring ? (
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{ boxShadow: `inset 0 0 0 2px ${adornment.ring.color}` }}
        />
      ) : null}

      {CenterIcon && centerMark ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`flex items-center justify-center rounded-full ${
              compact ? "h-9 w-9" : "h-12 w-12"
            }`}
            style={{ backgroundColor: toneColor(centerMark.tone, accent) }}
          >
            <CenterIcon
              className={compact ? "h-5 w-5" : "h-6 w-6"}
              color="#fff"
              aria-hidden
            />
          </span>
        </div>
      ) : null}

      {showChip ? (
        <div
          className={`absolute bottom-3 right-3 flex items-center gap-1 rounded-full font-medium ${
            compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
          } ${
            chipIsAccent
              ? "text-white"
              : "border border-[#fafafa]/10 bg-black/70 text-[#fafafa]"
          }`}
          style={chipIsAccent ? { backgroundColor: accent } : undefined}
        >
          {CornerIcon && cornerMark ? (
            <CornerIcon
              className={compact ? "h-3 w-3" : "h-3.5 w-3.5"}
              color={chipIsAccent ? "#fff" : toneColor(cornerMark.tone, accent)}
              aria-hidden
            />
          ) : null}
          {badge ? (
            <span style={badgeTextColor ? { color: badgeTextColor } : undefined}>
              {badge.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
