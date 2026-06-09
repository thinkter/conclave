import { Logger } from "../utilities/loggers.js";

/**
 * Resolve the allowed CORS origins from the SFU_CORS_ORIGINS env var.
 *
 * SFU_CORS_ORIGINS is a comma-separated allow-list, e.g.
 *   SFU_CORS_ORIGINS="https://app.example.com,https://admin.example.com"
 *
 * When unset (the DEFAULT), we fall back to "*" so local dev is unchanged. This
 * lets production lock origins down purely via configuration — no code change
 * required. We log a warning when defaulting to "*" while NODE_ENV=production so
 * the loose policy is at least visible in prod logs.
 *
 * Returns either the literal "*" (allow any origin) or an explicit list of
 * origins. The shape is compatible with both the `cors` express middleware and
 * socket.io's `cors.origin` option.
 */
export const resolveCorsOrigins = (): "*" | string[] => {
  const raw = process.env.SFU_CORS_ORIGINS?.trim();

  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      Logger.warn(
        "[SFU] SFU_CORS_ORIGINS is not set; defaulting CORS origin to \"*\" in production. " +
          "Set SFU_CORS_ORIGINS to a comma-separated allow-list to lock this down.",
      );
    }
    return "*";
  }

  const origins = raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // A list that explicitly contains "*" (or collapses to empty) is treated as
  // allow-any so an operator can intentionally opt back into the open policy.
  if (origins.length === 0 || origins.includes("*")) {
    return "*";
  }

  return origins;
};
