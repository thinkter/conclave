import type { Server as SocketIOServer } from "socket.io";

const CONCLAVE_BOT_USER_ID = "conclave-assistant";
const CONCLAVE_BOT_DISPLAY_NAME = "Conclave";
const CONCLAVE_INTERRUPTED_MESSAGE = "Conclave was interrupted.";

export type ActiveConclaveAnswers = Map<string, { channelId: string }>;

export const trackConclaveAnswerPacket = (
  activeAnswers: ActiveConclaveAnswers,
  packet: { id: string; channelId: string; done: boolean },
): void => {
  if (packet.done) {
    activeAnswers.delete(packet.id);
    return;
  }

  activeAnswers.set(packet.id, { channelId: packet.channelId });
};

export const interruptActiveConclaveAnswers = (
  io: SocketIOServer,
  activeAnswers: ActiveConclaveAnswers,
): void => {
  const timestamp = Date.now();

  for (const [id, answer] of activeAnswers) {
    io.to(answer.channelId).emit("conclaveMessage", {
      id,
      userId: CONCLAVE_BOT_USER_ID,
      displayName: CONCLAVE_BOT_DISPLAY_NAME,
      content: CONCLAVE_INTERRUPTED_MESSAGE,
      timestamp,
      done: true,
      errored: true,
    });
  }

  activeAnswers.clear();
};
