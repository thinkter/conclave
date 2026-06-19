import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canUseGhostMode } from "@/lib/ghost-mode";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth.api
    .getSession({
      headers: request.headers,
    })
    .catch(() => null);

  return NextResponse.json({
    allowed: canUseGhostMode(session?.user?.email),
  });
}
