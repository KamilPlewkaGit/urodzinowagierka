import { NextRequest, NextResponse } from "next/server";

import { moveToNextTheFloorDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await moveToNextTheFloorDuel())) return NextResponse.json({ error: "Nie można jeszcze przejść do następnego pojedynku." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się przejść do następnego pojedynku The Floor", error);
    return NextResponse.json({ error: "Nie udało się przejść do następnego pojedynku." }, { status: 500 });
  }
}
