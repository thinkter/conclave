import { describe, expect, it, vi } from "vitest";
import type { Server as SocketIOServer } from "socket.io";
import {
  interruptActiveConclaveAnswers,
  trackConclaveAnswerPacket,
  type ActiveConclaveAnswers,
} from "../server/socket/conclaveRelayLifecycle.js";

type Emitted = { channelId: string; event: string; payload: unknown };

const fakeIo = () => {
  const emitted: Emitted[] = [];
  const io = {
    to: (channelId: string) => ({
      emit: (event: string, payload: unknown) => {
        emitted.push({ channelId, event, payload });
      },
    }),
  } as unknown as SocketIOServer;
  return { io, emitted };
};

describe("Conclave relay lifecycle", () => {
  it("broadcasts an errored terminal packet when an active asker disconnects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
    const { io, emitted } = fakeIo();
    const activeAnswers: ActiveConclaveAnswers = new Map();

    trackConclaveAnswerPacket(activeAnswers, {
      id: "answer-1",
      channelId: "room:one",
      done: false,
    });
    interruptActiveConclaveAnswers(io, activeAnswers);

    expect(emitted).toEqual([
      {
        channelId: "room:one",
        event: "conclaveMessage",
        payload: {
          id: "answer-1",
          userId: "conclave-assistant",
          displayName: "Conclave",
          content: "Conclave was interrupted.",
          timestamp: Date.now(),
          done: true,
          errored: true,
        },
      },
    ]);
    expect(activeAnswers.size).toBe(0);
    vi.useRealTimers();
  });

  it("does not interrupt an answer that already relayed a done packet", () => {
    const { io, emitted } = fakeIo();
    const activeAnswers: ActiveConclaveAnswers = new Map();

    trackConclaveAnswerPacket(activeAnswers, {
      id: "answer-1",
      channelId: "room:one",
      done: false,
    });
    trackConclaveAnswerPacket(activeAnswers, {
      id: "answer-1",
      channelId: "room:one",
      done: true,
    });
    interruptActiveConclaveAnswers(io, activeAnswers);

    expect(emitted).toEqual([]);
  });

  it("does not emit when no answer packet was relayed", () => {
    const { io, emitted } = fakeIo();
    const activeAnswers: ActiveConclaveAnswers = new Map();

    interruptActiveConclaveAnswers(io, activeAnswers);

    expect(emitted).toEqual([]);
  });

  it("clears active answers so repeated cleanup cannot emit duplicates", () => {
    const { io, emitted } = fakeIo();
    const activeAnswers: ActiveConclaveAnswers = new Map();

    trackConclaveAnswerPacket(activeAnswers, {
      id: "answer-1",
      channelId: "room:one",
      done: false,
    });
    interruptActiveConclaveAnswers(io, activeAnswers);
    interruptActiveConclaveAnswers(io, activeAnswers);

    expect(emitted).toHaveLength(1);
  });
});
