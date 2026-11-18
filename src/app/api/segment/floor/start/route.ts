import { NextRequest, NextResponse } from "next/server";

import { startTheFloorSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    const result = await startTheFloorSegment();
    if (result === "no-categories") return NextResponse.json({ error: "Brak dostępnych kategorii The Floor. Sprawdź pliki JSON z materiałami." }, { status: 409 });
    if (result !== "started") return NextResponse.json({ error: "Nie można teraz rozpocząć segmentu The Floor." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozpocząć The Floor", error);
    return NextResponse.json({ error: "Nie udało się rozpocząć segmentu The Floor." }, { status: 500 });
  }
}
