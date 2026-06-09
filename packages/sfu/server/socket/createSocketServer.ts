import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { config as defaultConfig } from "../../config/config.js";
import { resolveCorsOrigins } from "../cors.js";
import type { SfuState } from "../state.js";
import { attachSocketAuth } from "./auth.js";
import { registerConnectionHandlers } from "./registerConnectionHandlers.js";

// Cap the maximum size of a single inbound message. This is socket.io's own
// default (1 MB) made explicit so it is reviewable and tunable, and so it acts
// as a documented backstop against a client trying to push oversized frames
// (e.g. a huge Yjs/awareness payload) to exhaust memory.
const MAX_HTTP_BUFFER_SIZE = 1_000_000;

export type CreateSocketServerOptions = {
  state: SfuState;
  config?: typeof defaultConfig;
};

export const createSfuSocketServer = (
  httpServer: HttpServer,
  options: CreateSocketServerOptions,
): SocketIOServer => {
  const socketConfig = options.config ?? defaultConfig;
  const connectionStateRecovery =
    socketConfig.socket.recoveryMaxDisconnectionMs > 0
      ? {
          maxDisconnectionDuration:
            socketConfig.socket.recoveryMaxDisconnectionMs,
          skipMiddlewares: true,
        }
      : undefined;

  const io = new SocketIOServer(httpServer, {
    cors: {
      // Env-driven allow-list; defaults to "*" so dev is unchanged. Set
      // SFU_CORS_ORIGINS (comma-separated) to lock origins down in prod.
      origin: resolveCorsOrigins(),
      methods: ["GET", "POST"],
    },
    maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
    pingInterval: socketConfig.socket.pingIntervalMs,
    pingTimeout: socketConfig.socket.pingTimeoutMs,
    connectionStateRecovery,
  });

  attachSocketAuth(io, { config: options.config });
  registerConnectionHandlers(io, options.state);

  return io;
};
