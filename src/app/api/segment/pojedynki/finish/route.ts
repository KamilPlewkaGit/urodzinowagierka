import { NextRequest, NextResponse } from "next/server";

import { finishPojedynkiDuel, getTeamBetSettlementError } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { pojedynkiWinnerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = pojedynkiWinnerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowy zwycięzca." }, { status: 400 });
  try {
    const status = await finishPojedynkiDuel(parsed.data.winnerTeamId);
    if (status !== "settled") return NextResponse.json({ error: getTeamBetSettlementError(status) }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać wyniku pojedynku", error);
    return NextResponse.json({ error: "Nie udało się zatwierdzić wyniku." }, { status: 500 });
  }
}
