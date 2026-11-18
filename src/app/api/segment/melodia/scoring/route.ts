import { NextRequest, NextResponse } from "next/server";

import { openMelodiaScoring } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await openMelodiaScoring())) return NextResponse.json({ error: "Nie można teraz przejść do punktacji." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się otworzyć punktacji melodii", error);
    return NextResponse.json({ error: "Nie udało się otworzyć punktacji." }, { status: 500 });
  }
}
