import type { Room } from "../../config/classes/Room.js";
import type {
  TranscriptSfuRelayStartResponse,
  TranscriptSfuRelayStatusResponse,
  TranscriptSfuRelayStopResponse,
} from "../../types.js";
import { SfuTranscriptRelay } from "./sfuTranscriptRelay.js";

type TranscriptRelayInstance = Pick<
  SfuTranscriptRelay,
  "controllerUserId" | "start" | "syncProducers" | "close"
>;

type TranscriptRelayStartOptions = {
  room: Room;
  workerUrl: string;
  workerToken: string;
  controllerUserId: string;
  controllerDisplayName: string;
  canReplaceExistingRelay: boolean;
};

export type TranscriptRelayRegistry = {
  getStatus: () => TranscriptSfuRelayStatusResponse;
  start: (options: TranscriptRelayStartOptions) => Promise<TranscriptSfuRelayStartResponse>;
  stopRoom: (roomId: string) => TranscriptSfuRelayStopResponse;
  stopRoomForUser: (options: {
    roomId: string;
    userId: string;
    canStopAnyRelay: boolean;
  }) => TranscriptSfuRelayStopResponse | { error: string };
  syncRoom: (room: Room) => Promise<void>;
  closeAll: () => void;
};

export const createTranscriptRelayRegistry = (options: {
  enabled: boolean;
  createRelay?: (
    options: Omit<TranscriptRelayStartOptions, "canReplaceExistingRelay"> & {
      onClosed?: (message: string) => void;
    },
  ) => TranscriptRelayInstance;
}): TranscriptRelayRegistry => {
  const relays = new Map<string, TranscriptRelayInstance>();

  const getStatus = (): TranscriptSfuRelayStatusResponse => {
    if (!options.enabled) {
      return {
        mode: "sfu",
        status: "disabled",
        available: false,
        reason: "SFU transcript relay is disabled on this server.",
        updatedAt: Date.now(),
      };
    }
    return {
      mode: "sfu",
      status: "available",
      available: true,
      updatedAt: Date.now(),
    };
  };

  return {
    getStatus,
    async start(startOptions) {
      const status = getStatus();
      if (!status.available) {
        return {
          mode: "sfu",
          success: false,
          status: status.status,
          reason: status.reason,
          updatedAt: status.updatedAt,
        };
      }

      const existingRelay = relays.get(startOptions.room.id);
      if (
        existingRelay &&
        existingRelay.controllerUserId !== startOptions.controllerUserId &&
        !startOptions.canReplaceExistingRelay
      ) {
        return {
          mode: "sfu",
          success: false,
          status: "error",
          reason: "An SFU transcript relay is already controlled by another participant.",
          updatedAt: Date.now(),
        };
      }

      existingRelay?.close();
      let relay: TranscriptRelayInstance;
      relay = (options.createRelay ?? ((relayOptions) =>
        new SfuTranscriptRelay(relayOptions)))({
        room: startOptions.room,
        workerUrl: startOptions.workerUrl,
        workerToken: startOptions.workerToken,
        controllerUserId: startOptions.controllerUserId,
        controllerDisplayName: startOptions.controllerDisplayName,
        onClosed: () => {
          if (relays.get(startOptions.room.id) === relay) {
            relays.delete(startOptions.room.id);
          }
        },
      });
      relays.set(startOptions.room.id, relay);
      try {
        await relay.start();
        return {
          mode: "sfu",
          success: true,
          status: "available",
          updatedAt: Date.now(),
        };
      } catch (error) {
        relays.delete(startOptions.room.id);
        relay.close();
        return {
          mode: "sfu",
          success: false,
          status: "error",
          reason:
            error instanceof Error
              ? error.message
              : "Failed to start SFU transcript relay.",
          updatedAt: Date.now(),
        };
      }
    },
    stopRoom(roomId) {
      relays.get(roomId)?.close();
      relays.delete(roomId);
      return { success: true };
    },
    stopRoomForUser({ roomId, userId, canStopAnyRelay }) {
      const relay = relays.get(roomId);
      if (!relay) return { success: true };
      if (!canStopAnyRelay && relay.controllerUserId !== userId) {
        return {
          error: "Only the transcript relay controller, host, or admin can stop the SFU relay.",
        };
      }
      relay.close();
      relays.delete(roomId);
      return { success: true };
    },
    async syncRoom(room) {
      await relays.get(room.id)?.syncProducers();
    },
    closeAll() {
      for (const relay of relays.values()) {
        relay.close();
      }
      relays.clear();
    },
  };
};
