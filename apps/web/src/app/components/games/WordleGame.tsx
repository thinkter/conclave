"use client";

import React, { useMemo, useRef, useState } from "react";
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
type PlayerOutcome = "win" | "lose" | "timeout";

type WordlePublic = {
  phase: "lobby" | "set-word" | "playing" | "results";
  wordSource: "random" | "setter";
  setterId: string | null;
  setterName: string | null;
  serverNow: number;
  deadline: number | null;
  timeLimitMs: number;
  wordLength: number;
  maxTries: number;
  standings: Array<{
    playerId: string;
    playerName: string;
    triesUsed: number;
    outcome: PlayerOutcome | null;
    solvedAt: number | null;
  }>;
  finishedCount: number;
  totalContestants: number;
  result: {
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
  myGuesses: Array<{ word: string; feedback: TileState[]; at: number }>;
  myOutcome: PlayerOutcome | null;
  mySolvedAt: number | null;
};

const WORDLE_GREEN = "#6AAA64";
const WORDLE_YELLOW = "#C9B458";
const WORDLE_GRAY = "#3a3a3c";

const letterBg = (state: TileState | "empty"): string => {
  if (state === "green") return WORDLE_GREEN;
  if (state === "yellow") return WORDLE_YELLOW;
  if (state === "gray") return WORDLE_GRAY;
  return "transparent";
};

const tileBorder = (state: TileState | "empty", hasLetter: boolean): string => {
  if (state !== "empty") return "transparent";
  return hasLetter ? color.borderStrong : color.border;
};

const statusText = (outcome: PlayerOutcome | null): string => {
  if (outcome === "win") return "Solved";
  if (outcome === "lose") return "Out of tries";
  if (outcome === "timeout") return "Timed out";
  return "Playing";
};

const normalizeWordInput = (raw: string, label: "Guess" | "Word", wordLength: number) => {
  const trimmed = raw.trim();
  if (trimmed.length !== wordLength) {
    return {
      ok: false as const,
      error: `${label} must be exactly ${wordLength} letters`,
    };
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
  isAdmin,
  readOnly = false,
  move,
}: GameViewProps<WordlePublic, WordleMe>) {
  const [secretDraft, setSecretDraft] = useState("");
  const [guessDraft, setGuessDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const remainingMs = useRemaining(pub.deadline, pub.serverNow);
  const wordLengthLabel = `${pub.wordLength}-letter`;

  const runMove = async (type: string, payload?: unknown) => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await move(type, payload);
      if (!result.success) {
        setError(result.error ?? "Something went wrong");
        return false;
      }
      return true;
    } catch {
      setError("Something went wrong");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submitSecretWord = async () => {
    if (busyRef.current || readOnly) return;
    const normalized = normalizeWordInput(secretDraft, "Word", pub.wordLength);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    const ok = await runMove("setWord", { word: normalized.word });
    if (ok) setSecretDraft("");
  };

  const submitGuess = async () => {
    if (busyRef.current || readOnly) return;
    const normalized = normalizeWordInput(guessDraft, "Guess", pub.wordLength);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    const ok = await runMove("guess", { word: normalized.word });
    if (ok) setGuessDraft("");
  };

  const gridRows = useMemo(() => {
    const rows: Array<{ letters: string[]; states: (TileState | "empty")[] }> = [];
    for (let i = 0; i < pub.maxTries; i += 1) {
      const entry = me.myGuesses[i];
      if (entry) {
        rows.push({
          letters: entry.word.split(""),
          states: entry.feedback,
        });
      } else if (
        pub.phase === "playing" &&
        me.canGuess &&
        me.myOutcome == null &&
        i === me.myGuesses.length
      ) {
        const letters = guessDraft
          .toUpperCase()
          .replace(/[^A-Z]/g, "")
          .slice(0, pub.wordLength)
          .padEnd(pub.wordLength)
          .split("");
        rows.push({
          letters,
          states: Array(pub.wordLength).fill("empty"),
        });
      } else {
        rows.push({
          letters: Array(pub.wordLength).fill(""),
          states: Array(pub.wordLength).fill("empty"),
        });
      }
    }
    return rows;
  }, [guessDraft, me.canGuess, me.myGuesses, me.myOutcome, pub.maxTries, pub.phase, pub.wordLength]);

  const wordleAccent = WORDLE_GREEN;

  const letterStates = useMemo(() => {
    const map: Record<string, TileState> = {};
    const rank: Record<TileState, number> = { gray: 0, yellow: 1, green: 2 };
    for (const guess of me.myGuesses) {
      for (let i = 0; i < guess.word.length; i++) {
        const ch = guess.word[i];
        const fb = guess.feedback[i];
        if (!map[ch] || rank[fb] > rank[map[ch]]) {
          map[ch] = fb;
        }
      }
    }
    return map;
  }, [me.myGuesses]);

  const isRandomMode = pub.wordSource === "random";
  const minPlayers = isRandomMode ? 1 : 2;

  if (pub.phase === "lobby") {
    return (
      <GameLobby
        gameId="wordle"
        title={isRandomMode ? "Guess the word" : "Same word, solo boards"}
        blurb={
          isRandomMode
            ? `A random ${wordLengthLabel} word is picked. Everyone guesses on their own board. Fewest tries wins.`
            : `One random player sets a ${wordLengthLabel} word. Everyone else solves it on their own board. Lowest tries wins.`
        }
        players={players}
        isAdmin={isAdmin}
        readOnly={readOnly}
        canStart={players.length >= minPlayers}
        disabledLabel={`Need at least ${minPlayers} player${minPlayers > 1 ? "s" : ""}`}
        startLabel="Start Wordle"
        onStart={() => {
          void runMove("start");
        }}
      />
    );
  }

  if (pub.phase === "results" && pub.result) {
    return (
      <div style={{ padding: "4px 2px" }}>
        <p style={{ fontFamily: HEAD_FONT, fontSize: 18, color: color.text, margin: "0 0 4px", textAlign: "center" }}>
          {pub.result.winnerName ? "Round complete" : "No winner"}
        </p>
        {pub.result.winnerName ? (
          <p style={{ fontSize: 13, color: wordleAccent, textAlign: "center", margin: "0 0 6px" }}>
            {pub.result.winnerName} cracked it
          </p>
        ) : null}
        <p style={{ fontSize: 13, color: color.textMuted, textAlign: "center", margin: "0 0 16px" }}>
          The word was{" "}
          <span style={{ color: color.text, fontFamily: HEAD_FONT, fontWeight: 600, letterSpacing: "0.12em" }}>
            {pub.result.targetWord ?? "—"}
          </span>
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {pub.standings.map((entry, i) => (
            <div
              key={entry.playerId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 10px",
                borderRadius: radius.sm,
                background: entry.outcome === "win" ? `${wordleAccent}22` : "transparent",
              }}
            >
              <span style={{ width: 16, fontSize: 12, color: i === 0 && entry.outcome === "win" ? wordleAccent : color.textFaint, fontFamily: HEAD_FONT, fontWeight: 500 }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.playerName}
              </span>
              <span style={{ fontSize: 12, color: color.textMuted, fontFamily: HEAD_FONT }}>
                {entry.outcome === "win" ? `${entry.triesUsed}/${pub.maxTries}` : statusText(entry.outcome)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ margin: 0, color: wordleAccent, fontFamily: HEAD_FONT, fontSize: 12 }}>
            {isRandomMode ? "Wordle" : pub.setterName ? `Set by ${pub.setterName}` : "Wordle"}
          </p>
          <p style={{ margin: "2px 0 0", color: color.textFaint, fontSize: 11 }}>
            {pub.finishedCount}/{pub.totalContestants} finished
            {pub.phase === "playing" ? ` · ${formatMmSs(remainingMs)}` : ""}
          </p>
        </div>
        {pub.phase === "playing" ? (
          <CountdownRing
            remainingMs={remainingMs}
            totalMs={pub.timeLimitMs}
            label={`${pub.finishedCount}/${pub.totalContestants}`}
          />
        ) : null}
      </div>

      {pub.phase === "set-word" ? (
        me.canSetWord ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0 8px" }}>
            <p style={{ margin: 0, color: color.text, fontFamily: HEAD_FONT, fontSize: 17 }}>
              You're the word setter
            </p>
            <p style={{ margin: 0, color: color.textMuted, fontSize: 13, lineHeight: 1.5, textAlign: "center", maxWidth: 260 }}>
              Pick a valid {wordLengthLabel} English word. Everyone else will try to guess it.
            </p>
            <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 300 }}>
              <input
                value={secretDraft}
                maxLength={pub.wordLength}
                disabled={busy || readOnly}
                onChange={(event) => setSecretDraft(event.currentTarget.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!busy && !readOnly) void submitSecretWord();
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
                  fontSize: 16,
                  textAlign: "center",
                }}
              />
              <PrimaryButton
                disabled={busy || readOnly}
                onClick={() => void submitSecretWord()}
              >
                Set
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
              padding: "13px 16px",
              borderRadius: radius.pill,
              background: color.surfaceRaised,
              border: `1px solid ${color.border}`,
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: radius.pill, background: wordleAccent }} />
            <span style={{ fontSize: 13, color: color.text }}>
              {pub.setterName ?? "Someone"} is picking a word
            </span>
          </div>
        )
      ) : null}

      {!me.isSetter && pub.phase !== "set-word" ? (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{ display: "grid", gap: 4 }}>
              {gridRows.map((row, rowIndex) => (
                <div
                  key={`row-${rowIndex}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${pub.wordLength}, 48px)`,
                    gap: 4,
                  }}
                >
                  {row.letters.map((letter, colIndex) => {
                    const state = row.states[colIndex];
                    const hasLetter = letter.trim().length > 0;
                    return (
                      <div
                        key={`tile-${rowIndex}-${colIndex}`}
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: 3,
                          border: `2px solid ${tileBorder(state, hasLetter)}`,
                          background: letterBg(state),
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: HEAD_FONT,
                          fontSize: 22,
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {pub.phase === "playing" && me.canGuess && !me.myOutcome ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <input
                value={guessDraft}
                maxLength={pub.wordLength}
                disabled={busy || readOnly}
                onChange={(event) => setGuessDraft(event.currentTarget.value.toUpperCase())}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!busy && !readOnly) void submitGuess();
                  }
                }}
                placeholder="Type and press Enter"
                style={{
                  width: pub.wordLength * 48 + (pub.wordLength - 1) * 4,
                  padding: "10px 14px",
                  borderRadius: radius.md,
                  border: `1px solid ${color.border}`,
                  background: color.surfaceRaised,
                  color: color.text,
                  letterSpacing: "0.18em",
                  fontFamily: HEAD_FONT,
                  fontSize: 15,
                  textAlign: "center",
                }}
              />
            </div>
          ) : null}

          {me.myGuesses.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", maxWidth: pub.wordLength * 48 + (pub.wordLength - 1) * 4, alignSelf: "center" }}>
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => {
                const st = letterStates[ch];
                return (
                  <span
                    key={ch}
                    style={{
                      width: 24,
                      height: 28,
                      borderRadius: 3,
                      background: st ? letterBg(st) : color.surfaceRaised,
                      border: st ? "none" : `1px solid ${color.border}`,
                      color: st ? "#fff" : color.textFaint,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontFamily: HEAD_FONT,
                      fontWeight: 600,
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          ) : null}
        </>
      ) : pub.phase !== "set-word" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            padding: "13px 16px",
            borderRadius: radius.pill,
            background: color.surfaceRaised,
            border: `1px solid ${color.border}`,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: radius.pill, background: wordleAccent }} />
          <span style={{ fontSize: 13, color: color.text }}>You set the word</span>
          <span style={{ fontSize: 13, color: color.textMuted }}>· watching players guess</span>
        </div>
      ) : null}

      {pub.standings.length > 1 && pub.phase === "playing" ? (
        <div style={{ paddingTop: 10, borderTop: `1px solid ${color.border}` }}>
          <p style={{ fontSize: 11, color: color.textFaint, fontFamily: HEAD_FONT, margin: "0 0 6px" }}>Standings</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {pub.standings.map((entry, i) => (
              <div
                key={entry.playerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 10px",
                  borderRadius: radius.sm,
                  background: entry.outcome === "win" ? `${wordleAccent}22` : "transparent",
                }}
              >
                <span style={{ width: 16, fontSize: 12, color: i === 0 && entry.outcome === "win" ? wordleAccent : color.textFaint, fontFamily: HEAD_FONT, fontWeight: 500 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: color.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.playerName}
                </span>
                <span style={{ fontSize: 11, color: entry.outcome === "win" ? wordleAccent : color.textMuted, fontFamily: HEAD_FONT }}>
                  {entry.outcome ? statusText(entry.outcome) : `${entry.triesUsed}/${pub.maxTries}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? <p style={{ margin: 0, color: color.danger, fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}
