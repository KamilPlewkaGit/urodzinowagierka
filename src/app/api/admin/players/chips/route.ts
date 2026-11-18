import { NextRequest, NextResponse } from "next/server";

import { setPlayerTokens } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { adminChipAdjustmentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const parsed = adminChipAdjustmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowa liczba żetonów." }, { status: 400 });
  }

  try {
    const adjustment = await setPlayerTokens(parsed.data);
    if (!adjustment) {
      return NextResponse.json({ error: "Ten gracz nie jest już aktywny." }, { status: 404 });
    }
    return NextResponse.json({ adjustment });
  } catch (error) {
    console.error("Nie udało się zmienić żetonów gracza", error);
    return NextResponse.json({ error: "Nie udało się zapisać liczby żetonów." }, { status: 500 });
  }
}
