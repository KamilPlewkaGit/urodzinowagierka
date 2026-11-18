import { NextRequest, NextResponse } from "next/server";

import { finishSportBonusRound } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { sportBonusWinnerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = sportBonusWinnerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowy wynik bonusu." }, { status: 400 });
  try {
    if (!(await finishSportBonusRound(parsed.data))) return NextResponse.json({ error: "Nie można teraz zatwierdzić wyniku bonusu." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zatwierdzić bonusu Sport", error);
    return NextResponse.json({ error: "Nie udało się zatwierdzić bonusu." }, { status: 500 });
  }
}
