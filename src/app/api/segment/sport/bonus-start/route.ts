import { NextRequest, NextResponse } from "next/server";

import { startSportBonusRound } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await startSportBonusRound())) return NextResponse.json({ error: "Najpierw ustaw wymagania dla wszystkich drużyn." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozpocząć rundy bonusowej", error);
    return NextResponse.json({ error: "Nie udało się rozpocząć rundy bonusowej." }, { status: 500 });
  }
}
