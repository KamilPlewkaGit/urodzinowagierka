import { NextRequest, NextResponse } from "next/server";

import { startSportChallenge } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await startSportChallenge())) return NextResponse.json({ error: "Nie można rozpocząć wyzwania. Wszyscy uprawnieni gracze muszą najpierw obstawić." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozpocząć wyzwania Sport", error);
    return NextResponse.json({ error: "Nie udało się rozpocząć wyzwania." }, { status: 500 });
  }
}
