import { NextRequest, NextResponse } from "next/server";

import { createAdminSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const parsed = adminLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane logowania." }, { status: 400 });
  }

  if (parsed.data.password !== "admin") {
    return NextResponse.json({ error: "Nieprawidłowe dane prowadzącego." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createAdminSession(), sessionCookieOptions);
  return response;
}
