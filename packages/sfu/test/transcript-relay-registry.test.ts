import { describe, expect, it } from "vitest";
import type { Room } from "../config/classes/Room.js";
import { createTranscriptRelayRegistry } from "../server/transcript/relayRegistry.js";

const room = { id: "room-a" } as Room;

const createRegistry = () => {
  const closed: string[] = [];
  const relays = new Map<string, { onClosed?: (message: string) => void }>();
  const registry = createTranscriptRelayRegistry({
    enabled: true,
    createRelay: (options) => {
      relays.set(options.controllerUserId, {
        onClosed: options.onClosed,
      });
      return {
        controllerUserId: options.controllerUserId,
        start: async () => {},
        syncProducers: async () => {},
        close: () => {
          closed.push(options.controllerUserId);
        },
      };
    },
  });
  return { closed, registry, relays };
};

describe("TranscriptRelayRegistry", () => {
  it("blocks ordinary participants from replacing another active relay", async () => {
    const { closed, registry } = createRegistry();

    expect(
      await registry.start({
        room,
        workerUrl: "http://worker.test",
        workerToken: "token-a",
        controllerUserId: "u1",
        controllerDisplayName: "Ada",
        canReplaceExistingRelay: false,
      }),
    ).toMatchObject({ success: true });

    expect(
      await registry.start({
        room,
        workerUrl: "http://worker.test",
        workerToken: "token-b",
        controllerUserId: "u2",
        controllerDisplayName: "Grace",
        canReplaceExistingRelay: false,
      }),
    ).toMatchObject({
      success: false,
      reason: "An SFU transcript relay is already controlled by another participant.",
    });
    expect(closed).toEqual([]);
  });

  it("allows host/admin replacement and cleans up stale relays after close callbacks", async () => {
    const { closed, registry, relays } = createRegistry();

    await registry.start({
      room,
      workerUrl: "http://worker.test",
      workerToken: "token-a",
      controllerUserId: "u1",
      controllerDisplayName: "Ada",
      canReplaceExistingRelay: false,
    });
    expect(
      await registry.start({
        room,
        workerUrl: "http://worker.test",
        workerToken: "token-b",
        controllerUserId: "u2",
        controllerDisplayName: "Grace",
        canReplaceExistingRelay: true,
      }),
    ).toMatchObject({ success: true });
    expect(closed).toEqual(["u1"]);

    relays.get("u2")?.onClosed?.("worker relay closed");
    expect(
      await registry.start({
        room,
        workerUrl: "http://worker.test",
        workerToken: "token-c",
        controllerUserId: "u3",
        controllerDisplayName: "Lin",
        canReplaceExistingRelay: false,
      }),
    ).toMatchObject({ success: true });
  });
});
