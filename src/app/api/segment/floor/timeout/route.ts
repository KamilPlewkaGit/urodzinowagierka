import { NextRequest, NextResponse } from "next/server";

import { finishExpiredTheFloorDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await finishExpiredTheFloorDuel())) return NextResponse.json({ error: "Czas aktywnego zawodnika jeszcze nie upłynął." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zakończyć czasu The Floor", error);
    return NextResponse.json({ error: "Nie udało się zakończyć pojedynku po czasie." }, { status: 500 });
  }
}
