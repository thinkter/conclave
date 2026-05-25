export const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  underscore: "\x1b[4m",
  blink: "\x1b[5m",
  reverse: "\x1b[7m",
  hidden: "\x1b[8m",

  fg: {
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
  },
  bg: {
    black: "\x1b[40m",
    red: "\x1b[41m",
    green: "\x1b[42m",
    yellow: "\x1b[43m",
    blue: "\x1b[44m",
    magenta: "\x1b[45m",
    cyan: "\x1b[46m",
    white: "\x1b[47m",
  },
};

const getTimestamp = () => {
  return new Date().toISOString().split("T")[1].slice(0, -1);
};

const PREFIX = `${colors.fg.magenta}[SFU]${colors.reset}`;

type LogLevel = "error" | "warn" | "info" | "debug";

const levelOrder: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const resolveLogLevel = (): LogLevel => {
  const envLevel = (
    process.env.SFU_LOG_LEVEL ||
    process.env.LOG_LEVEL ||
    ""
  ).toLowerCase();
  if (envLevel in levelOrder) {
    return envLevel as LogLevel;
  }
  return process.env.NODE_ENV === "production" ? "warn" : "info";
};

const activeLogLevel = resolveLogLevel();
const logFormat = (process.env.SFU_LOG_FORMAT || "").toLowerCase();
const useJsonLogs = logFormat === "json";

const shouldLog = (level: LogLevel) => {
  return levelOrder[level] <= levelOrder[activeLogLevel];
};

const writeLog = (
  writer: (...data: any[]) => void,
  level: LogLevel | "success",
  message: string,
  args: any[],
) => {
  if (useJsonLogs) {
    writer(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "sfu",
        instanceId: process.env.SFU_INSTANCE_ID || null,
        version: process.env.SFU_VERSION || null,
        level,
        message,
        ...(args.length > 0 ? { details: args } : {}),
      }),
    );
    return;
  }

  const color =
    level === "error"
      ? colors.fg.red
      : level === "warn"
        ? colors.fg.yellow
        : level === "success"
          ? colors.fg.green
          : level === "debug"
            ? colors.fg.gray
            : colors.fg.cyan;
  const label = level === "success" ? "SUCCESS" : level.toUpperCase();

  writer(
    `${colors.dim}${getTimestamp()}${colors.reset} ${PREFIX} ${color}${label}${colors.reset}  ${message}`,
    ...args,
  );
};

export const Logger = {
  info: (message: string, ...args: any[]) => {
    if (!shouldLog("info")) return;
    writeLog(console.log, "info", message, args);
  },

  success: (message: string, ...args: any[]) => {
    if (!shouldLog("info")) return;
    writeLog(console.log, "success", message, args);
  },

  warn: (message: string, ...args: any[]) => {
    if (!shouldLog("warn")) return;
    writeLog(console.warn, "warn", message, args);
  },

  error: (message: string, ...args: any[]) => {
    if (!shouldLog("error")) return;
    writeLog(console.error, "error", message, args);
  },

  debug: (message: string, ...args: any[]) => {
    if (!shouldLog("debug")) return;
    writeLog(console.log, "debug", message, args);
  },
};
