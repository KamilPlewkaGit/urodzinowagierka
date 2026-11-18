import { NextRequest, NextResponse } from "next/server";

import { revokeSession } from "@/lib/database";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
