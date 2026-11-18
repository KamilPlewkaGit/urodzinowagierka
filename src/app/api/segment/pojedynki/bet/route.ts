import { NextRequest, NextResponse } from "next/server";

import { placePojedynkiBet } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { pojedynkiBetSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "player") return NextResponse.json({ error: "Tylko zalogowany gracz może postawić zakład." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = pojedynkiBetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowy zakład." }, { status: 400 });
  try {
    if (!(await placePojedynkiBet({ bettorId: session.playerId, targetTeamId: parsed.data.targetTeamId }))) return NextResponse.json({ error: "Nie możesz teraz postawić zakładu. Sprawdź saldo i fazę pojedynku." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się postawić zakładu na pojedynek", error);
    return NextResponse.json({ error: "Nie udało się postawić zakładu." }, { status: 500 });
  }
}
