"use client";

import React, { useMemo, useState } from "react";
import { color, radius } from "@conclave/ui-tokens";
import {
  CountdownRing,
  GameLobby,
  HEAD_FONT,
  PrimaryButton,
  useRemaining,
  type GameViewProps,
} from "./gameUi";

type TileState = "green" | "yellow" | "gray";

type WordlePublic = {
  phase: "lobby" | "set-word" | "playing" | "results";
  setterId: string | null;
  setterName: string | null;
  serverNow: number;
  deadline: number | null;
  timeLimitMs: number;
  wordLength: number;
  maxTries: number;
  triesUsed: number;
  triesLeft: number;
  guesses: Array<{
    playerId: string;
    playerName: string;
    word: string;
    feedback: TileState[];
  }>;
  result: {
    outcome: "win" | "lose" | "timeout" | null;
    targetWord: string | null;
    winnerId: string | null;
    winnerName: string | null;
  } | null;
};

type WordleMe = {
  isSetter: boolean;
  canSetWord: boolean;
  canGuess: boolean;
  secretWord: string | null;
};

const letterBg = (state: TileState | "empty"): string => {
  if (state === "green") return "#4c9a56";
  if (state === "yellow") return "#b79f3b";
  if (state === "gray") return "#3a3a3c";
  return "#232327";
};

const WORD_API_BASE = "https://api.dictionaryapi.dev/api/v2/entries/en/";

const validateWordViaApi = async (word: string): Promise<boolean | null> => {
  try {
    const response = await fetch(`${WORD_API_BASE}${word.toLowerCase()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (response.ok) return true;
    if (response.status === 404) return false;
    return null;
  } catch {
    return null;
  }
};

const normalizeWordInput = (raw: string, label: "Guess" | "Word") => {
  const trimmed = raw.trim();
  if (trimmed.length !== 5) {
    return { ok: false as const, error: `${label} must be exactly 5 letters` };
  }
  if (!/^[a-zA-Z]+$/.test(trimmed)) {
    return { ok: false as const, error: `${label} must contain letters only` };
  }
  return { ok: true as const, word: trimmed.toUpperCase() };
};

const formatMmSs = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

export default function WordleGame({
  pub,
  me,
  players,
  userId,
  isAdmin,
  readOnly = false,
  move,
}: GameViewProps<WordlePublic, WordleMe>) {
  const [secretDraft, setSecretDraft] = useState("");
  const [guessDraft, setGuessDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remainingMs = useRemaining(pub.deadline, pub.serverNow);

  const runMove = async (type: string, payload?: unknown) => {
    setBusy(true);
    setError(null);
    const result = await move(type, payload);
    setBusy(false);
    if (!result.success) {
      setError(result.error ?? "Something went wrong");
      return false;
    }
    return true;
  };

  const submitSecretWord = async () => {
    const normalized = normalizeWordInput(secretDraft, "Word");
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    const dictionaryResult = await validateWordViaApi(normalized.word);
    if (dictionaryResult === false) {
      setError("Not in word list");
      return;
    }

    const ok = await runMove("setWord", { word: normalized.word });
    if (ok) setSecretDraft("");
  };

  const submitGuess = async () => {
    const normalized = normalizeWordInput(guessDraft, "Guess");
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    const dictionaryResult = await validateWordViaApi(normalized.word);
    if (dictionaryResult === false) {
      setError("Not in word list");
      return;
    }

    const ok = await runMove("guess", { word: normalized.word });
    if (ok) setGuessDraft("");
  };

  const gridRows = useMemo(() => {
    const rows: Array<{ letters: string[]; states: (TileState | "empty")[]; by: string | null }> = [];
    for (let i = 0; i < pub.maxTries; i += 1) {
      const entry = pub.guesses[i];
      if (entry) {
        rows.push({
          letters: entry.word.split(""),
          states: entry.feedback,
          by: entry.playerName,
        });
      } else if (pub.phase === "playing" && me.canGuess && i === pub.guesses.length) {
        const letters = guessDraft
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, pub.wordLength)
          .padEnd(pub.wordLength)
          .split("");
        rows.push({
          letters,
          states: Array(pub.wordLength).fill("empty"),
          by: "typing…",
        });
      } else {
        rows.push({
          letters: Array(pub.wordLength).fill(""),
          states: Array(pub.wordLength).fill("empty"),
          by: null,
        });
      }
    }
    return rows;
  }, [guessDraft, me.canGuess, pub.guesses, pub.maxTries, pub.phase, pub.wordLength]);

  if (pub.phase === "lobby") {
    return (
      <GameLobby
        gameId="wordle"
        title="Wordle party round"
        blurb="One random player sets a secret five-letter word. Everyone else has six shared tries to crack it."
        players={players}
        isAdmin={isAdmin}
        readOnly={readOnly}
        canStart={players.length >= 2}
        disabledLabel="Need at least 2 players"
        startLabel="Start Wordle"
        onStart={() => {
          void runMove("start");
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, color: color.accent, fontFamily: HEAD_FONT, fontSize: 13 }}>
            {pub.setterName ? `Word setter: ${pub.setterName}` : "Word setter"}
          </p>
          <p style={{ margin: "3px 0 0", color: color.textFaint, fontSize: 12 }}>
            {pub.triesUsed}/{pub.maxTries} tries used
            {pub.phase === "playing" ? ` · ${formatMmSs(remainingMs)} left` : ""}
          </p>
        </div>
        {pub.phase === "playing" ? (
          <CountdownRing remainingMs={remainingMs} totalMs={pub.timeLimitMs} label={`${pub.triesLeft} left`} />
        ) : null}
      </div>

      {pub.phase === "set-word" ? (
        me.canSetWord ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ margin: 0, color: color.text, fontFamily: HEAD_FONT, fontSize: 16 }}>
              You were chosen to set the word
            </p>
            <p style={{ margin: 0, color: color.textMuted, fontSize: 13, lineHeight: 1.5 }}>
              Enter a valid 5-letter English word. It is hidden from everyone until the round ends.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={secretDraft}
                maxLength={5}
                disabled={busy || readOnly}
                onChange={(event) => setSecretDraft(event.currentTarget.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!busy && !readOnly) {
                      void submitSecretWord();
                    }
                  }
                }}
                placeholder="WORD"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: radius.md,
                  border: `1px solid ${color.border}`,
                  background: color.surfaceRaised,
                  color: color.text,
                  letterSpacing: "0.2em",
                  fontFamily: HEAD_FONT,
                }}
              />
              <PrimaryButton
                disabled={busy || readOnly}
                onClick={() => {
                  void submitSecretWord();
                }}
              >
                Set word
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div
            style={{
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              background: color.surfaceRaised,
              padding: "14px 12px",
            }}
          >
            <p style={{ margin: 0, color: color.text, fontFamily: HEAD_FONT, fontSize: 15 }}>
              Waiting for {pub.setterName ?? "the selected player"} to set the secret word…
            </p>
          </div>
        )
      ) : null}

      <div style={{ display: "grid", gap: 8 }}>
        {gridRows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${pub.wordLength}, minmax(0, 1fr))`, gap: 6, flex: 1 }}>
              {row.letters.map((letter, colIndex) => (
                <div
                  key={`tile-${rowIndex}-${colIndex}`}
                  style={{
                    height: 42,
                    borderRadius: radius.sm,
                    border: `1px solid ${row.states[colIndex] === "empty" ? color.border : "transparent"}`,
                    background: letterBg(row.states[colIndex]),
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: HEAD_FONT,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {letter}
                </div>
              ))}
            </div>
            <span style={{ width: 72, textAlign: "right", color: color.textFaint, fontSize: 11 }}>
              {row.by ?? ""}
            </span>
          </div>
        ))}
      </div>

      {pub.phase === "playing" && me.canGuess ? (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={guessDraft}
            maxLength={5}
            disabled={busy || readOnly}
            onChange={(event) => setGuessDraft(event.currentTarget.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!busy && !readOnly) {
                  void submitGuess();
                }
              }
            }}
            placeholder="ENTER GUESS"
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: radius.md,
              border: `1px solid ${color.border}`,
              background: color.surfaceRaised,
              color: color.text,
              letterSpacing: "0.18em",
              fontFamily: HEAD_FONT,
            }}
          />
          <PrimaryButton
            disabled={busy || readOnly}
            onClick={() => {
              void submitGuess();
            }}
          >
            Guess
          </PrimaryButton>
        </div>
      ) : null}

      {pub.phase === "playing" && me.isSetter ? (
        <p style={{ margin: 0, color: color.textMuted, fontSize: 12 }}>
          You are the setter. Watch the guesses roll in.
        </p>
      ) : null}

      {pub.phase === "results" && pub.result ? (
        <div
          style={{
            borderRadius: radius.md,
            border: `1px solid ${color.border}`,
            background: color.surfaceRaised,
            padding: "12px 14px",
          }}
        >
          <p style={{ margin: 0, color: color.text, fontFamily: HEAD_FONT, fontSize: 16 }}>
            {pub.result.outcome === "win"
              ? `Solved by ${pub.result.winnerName ?? "a player"}`
              : pub.result.outcome === "timeout"
                ? "Time is up"
                : "No tries left"}
          </p>
          <p style={{ margin: "6px 0 0", color: color.textMuted, fontSize: 13 }}>
            Secret word: <span style={{ color: color.text, fontFamily: HEAD_FONT }}>{pub.result.targetWord ?? "—"}</span>
          </p>
        </div>
      ) : null}

      {error ? <p style={{ margin: 0, color: color.danger, fontSize: 12 }}>{error}</p> : null}
      {!error && readOnly ? (
        <p style={{ margin: 0, color: color.textFaint, fontSize: 12 }}>
          Observer mode is read-only.
        </p>
      ) : null}
      {!error && pub.phase === "playing" && !me.canGuess && !me.isSetter ? (
        <p style={{ margin: 0, color: color.textFaint, fontSize: 12 }}>
          Waiting for the round to begin.
        </p>
      ) : null}
      {pub.phase === "playing" && userId === null ? (
        <p style={{ margin: 0, color: color.textFaint, fontSize: 12 }}>
          Join as a player to submit guesses.
        </p>
      ) : null}
    </div>
  );
}
