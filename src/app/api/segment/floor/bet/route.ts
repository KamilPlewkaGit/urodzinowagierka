import { NextRequest, NextResponse } from "next/server";

import { placeTheFloorBet } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { theFloorBetSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "player") return NextResponse.json({ error: "Tylko zalogowany gracz może postawić zakład." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = theFloorBetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Wybrano nieprawidłową drużynę." }, { status: 400 });
  try {
    if (!(await placeTheFloorBet({ bettorId: session.playerId, targetTeamId: parsed.data.targetTeamId }))) {
      return NextResponse.json({ error: "Nie możesz teraz postawić tego zakładu. Sprawdź saldo, drużyny i fazę pojedynku." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się postawić zakładu The Floor", error);
    return NextResponse.json({ error: "Nie udało się postawić zakładu." }, { status: 500 });
  }
}
