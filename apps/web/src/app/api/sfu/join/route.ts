import { createHash, createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canUseGhostMode } from "@/lib/ghost-mode";

export const runtime = "nodejs";

type JoinRequestBody = {
  roomId?: string;
  sessionId?: string;
  joinMode?: "meeting" | "webinar_attendee";
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  };
  isHost?: boolean;
  isAdmin?: boolean;
  allowRoomCreation?: boolean;
  clientId?: string;
};

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type SfuPoolEntry = {
  id: string;
  publicUrl: string;
  healthUrl: string;
};

type SfuStatus = {
  instanceId?: string;
  draining?: boolean;
  rooms?: number;
};

type CachedSfuStatus = {
  checkedAt: number;
  healthy: boolean;
  status: SfuStatus | null;
};

const DEFAULT_PUBLIC_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
];

const SFU_STATUS_CACHE_TTL_MS = 5000;
const SFU_STATUS_TIMEOUT_MS = 1500;

const sfuStatusCache = new Map<string, CachedSfuStatus>();

const resolveSfuUrl = () =>
  process.env.SFU_URL || process.env.NEXT_PUBLIC_SFU_URL || "http://localhost:3031";

const splitUrls = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const parseSfuPoolEntries = (
  publicPool: string | undefined,
  healthPool: string | undefined,
): SfuPoolEntry[] => {
  const healthUrlsById = new Map<string, string>();
  for (const entry of splitUrls(healthPool)) {
    const separatorIndex = entry.indexOf("=");
    if (separatorIndex <= 0) continue;
    const id = entry.slice(0, separatorIndex).trim();
    const url = entry.slice(separatorIndex + 1).trim();
    if (id && url) {
      healthUrlsById.set(id, trimTrailingSlash(url));
    }
  }

  return splitUrls(publicPool)
    .map((entry): SfuPoolEntry | null => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) return null;
      const id = entry.slice(0, separatorIndex).trim();
      const publicUrl = entry.slice(separatorIndex + 1).trim();
      if (!id || !publicUrl) return null;
      return {
        id,
        publicUrl: trimTrailingSlash(publicUrl),
        healthUrl: healthUrlsById.get(id) ?? trimTrailingSlash(publicUrl),
      };
    })
    .filter((entry): entry is SfuPoolEntry => Boolean(entry));
};

const hashScore = (key: string): bigint => {
  const digest = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return BigInt(`0x${digest}`);
};

const chooseByRendezvousHash = (
  entries: SfuPoolEntry[],
  routingKey: string,
): SfuPoolEntry => {
  let selected = entries[0];
  let bestScore = hashScore(`${routingKey}:${selected.id}`);

  for (const entry of entries.slice(1)) {
    const score = hashScore(`${routingKey}:${entry.id}`);
    if (score > bestScore) {
      selected = entry;
      bestScore = score;
    }
  }

  return selected;
};

const fetchSfuStatus = async (entry: SfuPoolEntry): Promise<CachedSfuStatus> => {
  const cacheKey = entry.healthUrl;
  const cached = sfuStatusCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.checkedAt < SFU_STATUS_CACHE_TTL_MS) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SFU_STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(`${entry.healthUrl}/status`, {
      headers: {
        "x-sfu-secret": process.env.SFU_SECRET || "development-secret",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const status = response.ok ? ((await response.json()) as SfuStatus) : null;
    const result = {
      checkedAt: now,
      healthy: Boolean(response.ok && status && status.draining !== true),
      status,
    };
    sfuStatusCache.set(cacheKey, result);
    return result;
  } catch (_error) {
    const result = {
      checkedAt: now,
      healthy: false,
      status: null,
    };
    sfuStatusCache.set(cacheKey, result);
    return result;
  } finally {
    clearTimeout(timeout);
  }
};

const resolveRoutedSfuUrl = async (clientId: string, roomId: string) => {
  const pool = parseSfuPoolEntries(
    process.env.SFU_POOL || process.env.NEXT_PUBLIC_SFU_POOL,
    process.env.SFU_INTERNAL_POOL,
  );

  if (pool.length === 0) {
    return { sfuUrl: resolveSfuUrl(), sfuInstanceId: undefined };
  }

  const statuses = await Promise.all(
    pool.map(async (entry) => ({ entry, ...(await fetchSfuStatus(entry)) })),
  );
  const healthyEntries = statuses
    .filter((entry) => entry.healthy)
    .map((entry) => entry.entry);

  if (healthyEntries.length === 0) {
    return { error: "No healthy SFU instances are available" };
  }

  const selected = chooseByRendezvousHash(
    healthyEntries,
    `${clientId}:${roomId}`,
  );
  return { sfuUrl: selected.publicUrl, sfuInstanceId: selected.id };
};

const normalizeEmail = (
  value: string | null | undefined,
): string | undefined => {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
};

const parseEmailList = (value: string | undefined): Set<string> =>
  new Set(
    (value ?? "")
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter((entry): entry is string => Boolean(entry)),
  );

const alwaysHostEmails = parseEmailList(
  firstNonEmpty(
    process.env.SFU_ALWAYS_HOST_EMAILS,
    process.env.SFU_ALWAYS_HOST_EMAIL,
    process.env.ALWAYS_HOST_EMAILS,
    process.env.ALWAYS_HOST_EMAIL,
  ),
);

let turnCredentialWarningLogged = false;
let turnMissingCredentialWarningLogged = false;

const createTurnRestCredentials = (
  identity: string,
): { username: string; credential: string } | null => {
  const secret = firstNonEmpty(
    process.env.TURN_STATIC_AUTH_SECRET,
    process.env.TURN_REST_AUTH_SECRET,
  );
  if (!secret) return null;

  const ttlSeconds = Number(process.env.TURN_CREDENTIAL_TTL_SECONDS) || 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiresAt}:${identity}`;
  const credential = createHmac("sha1", secret)
    .update(username)
    .digest("base64");

  return { username, credential };
};

const resolveIceServers = (turnIdentity: string): IceServer[] => {
  const servers: IceServer[] = [];

  const configuredStunUrls = splitUrls(
    firstNonEmpty(
      process.env.STUN_URLS,
      process.env.STUN_URL,
      process.env.NEXT_PUBLIC_STUN_URLS,
      process.env.NEXT_PUBLIC_STUN_URL,
    ),
  );
  const stunUrls =
    configuredStunUrls.length > 0 ? configuredStunUrls : DEFAULT_PUBLIC_STUN_URLS;

  if (stunUrls.length > 0) {
    servers.push({
      urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls,
    });
  }

  const turnUrls = splitUrls(
    firstNonEmpty(
      process.env.TURN_URLS,
      process.env.TURN_URL,
      process.env.NEXT_PUBLIC_TURN_URLS,
      process.env.NEXT_PUBLIC_TURN_URL,
    ),
  );

  if (turnUrls.length > 0) {
    const restCredentials = createTurnRestCredentials(turnIdentity);
    const turnUsername =
      restCredentials?.username ??
      firstNonEmpty(
        process.env.TURN_USERNAME,
        process.env.NEXT_PUBLIC_TURN_USERNAME,
      );
    const turnCredential =
      restCredentials?.credential ??
      firstNonEmpty(
        process.env.TURN_PASSWORD,
        process.env.TURN_CREDENTIAL,
        process.env.NEXT_PUBLIC_TURN_PASSWORD,
        process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
      );

    const turnServer: IceServer = {
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
    };

    if (turnUsername && turnCredential) {
      turnServer.username = turnUsername;
      turnServer.credential = turnCredential;
    } else if (turnUsername || turnCredential) {
      if (!turnCredentialWarningLogged) {
        console.warn(
          "[SFU Join] TURN credential configuration is incomplete; ignoring username/password.",
        );
        turnCredentialWarningLogged = true;
      }
    } else if (!turnMissingCredentialWarningLogged) {
      console.warn(
        "[SFU Join] TURN URLs configured without credentials. Relay candidates may fail if TURN auth is required.",
      );
      turnMissingCredentialWarningLogged = true;
    }

    servers.push(turnServer);
  }

  return servers;
};

const resolveClientId = (request: Request, body?: JoinRequestBody) => {
  const envClientId =
    process.env.SFU_CLIENT_ID || process.env.NEXT_PUBLIC_SFU_CLIENT_ID;
  if (envClientId?.trim()) {
    return envClientId.trim();
  }

  const headerClientId = request.headers.get("x-sfu-client")?.trim() || "";
  const bodyClientId = body?.clientId?.trim() || "";
  return headerClientId || bodyClientId || "default";
};

export async function POST(request: Request) {
  let body: JoinRequestBody;
  try {
    body = (await request.json()) as JoinRequestBody;
  } catch (_error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roomId = body?.roomId?.trim();
  const sessionId = body?.sessionId?.trim();

  if (!roomId) {
    return NextResponse.json({ error: "Missing room ID" }, { status: 400 });
  }

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session ID" }, { status: 400 });
  }

  const clientId = resolveClientId(request, body);
  const joinMode =
    body?.joinMode === "webinar_attendee" ? "webinar_attendee" : "meeting";
  const session = await auth.api
    .getSession({
      headers: request.headers,
    })
    .catch(() => null);
  const sessionUser = session?.user;
  const sessionEmail = sessionUser?.email?.trim() || undefined;
  const email = sessionEmail || body?.user?.email?.trim() || undefined;
  const name =
    sessionUser?.name?.trim() || body?.user?.name?.trim() || undefined;
  const normalizedSessionEmail = normalizeEmail(sessionEmail);
  const providedId =
    sessionUser?.id?.trim() || body?.user?.id?.trim() || undefined;
  const baseUserId = email || providedId || `guest-${sessionId}`;
  const isWebinarAttendeeJoin = joinMode === "webinar_attendee";
  const canJoinAsGhost = canUseGhostMode(sessionEmail);
  const isForcedHost =
    !isWebinarAttendeeJoin &&
    Boolean(
      normalizedSessionEmail && alwaysHostEmails.has(normalizedSessionEmail),
    );
  const isHost = isWebinarAttendeeJoin
    ? false
    : isForcedHost || Boolean(body?.isHost ?? body?.isAdmin);
  const allowRoomCreation = isWebinarAttendeeJoin
    ? false
    : Boolean(body?.allowRoomCreation);

  const token = jwt.sign(
    {
      userId: baseUserId,
      email,
      name,
      isForcedHost,
      isHost,
      isAdmin: isHost,
      allowRoomCreation,
      clientId,
      sessionId,
      joinMode,
      canGhostMode: canJoinAsGhost,
    },
    process.env.SFU_SECRET || "development-secret",
    { expiresIn: "1h" }
  );

  const iceServers = resolveIceServers(`${baseUserId}:${sessionId}`);
  const routedSfu = await resolveRoutedSfuUrl(clientId, roomId);

  if ("error" in routedSfu) {
    return NextResponse.json({ error: routedSfu.error }, { status: 503 });
  }

  return NextResponse.json({
    token,
    sfuUrl: routedSfu.sfuUrl,
    ...(routedSfu.sfuInstanceId ? { sfuInstanceId: routedSfu.sfuInstanceId } : {}),
    ...(iceServers.length > 0 ? { iceServers } : {}),
  });
}
