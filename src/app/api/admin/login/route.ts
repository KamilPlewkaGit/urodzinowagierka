import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { createAdminSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request body is required." }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid credentials." }, { status: 400 });
  }

  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  // A missing or placeholder hash is deliberately fail-closed.
  const passwordMatches = passwordHash ? await bcrypt.compare(parsed.data.password, passwordHash).catch(() => false) : false;
  if (!passwordMatches) {
    return NextResponse.json({ error: "Invalid administrator credentials." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createAdminSession(), sessionCookieOptions);
  return response;
}
