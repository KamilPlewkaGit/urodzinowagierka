import { NextRequest, NextResponse } from "next/server";

import { placeSportBet } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { sportBetSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "player") return NextResponse.json({ error: "Tylko zalogowany gracz może postawić zakład." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = sportBetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Wybrano nieprawidłową drużynę." }, { status: 400 });
  try {
    if (!(await placeSportBet({ bettorId: session.playerId, targetTeamId: parsed.data.targetTeamId }))) return NextResponse.json({ error: "Nie możesz teraz postawić tego zakładu. Sprawdź saldo, drużyny i fazę wyzwania." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się postawić zakładu Sport", error);
    return NextResponse.json({ error: "Nie udało się postawić zakładu." }, { status: 500 });
  }
}
