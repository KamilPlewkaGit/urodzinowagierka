import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { OBSERVER_NICKNAME } from "@/lib/constants";
import { createObserverSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { adminLoginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const parsed = adminLoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Podaj poprawne hasło obserwatora." }, { status: 400 });
  }

  const expected = process.env.OBSERVER_PASSWORD || OBSERVER_NICKNAME;
  const digest = (password: string) => createHash("sha256").update(password).digest();
  if (!timingSafeEqual(digest(parsed.data.password), digest(expected))) {
    return NextResponse.json({ error: "Nieprawidłowe hasło obserwatora." }, { status: 401 });
  }

  try {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, await createObserverSession(), sessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Nie udało się utworzyć sesji obserwatora", error);
    return NextResponse.json({ error: "Nie udało się teraz otworzyć widoku obserwatora." }, { status: 503 });
  }
}
