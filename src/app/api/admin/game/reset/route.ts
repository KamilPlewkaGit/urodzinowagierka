import { NextRequest, NextResponse } from "next/server";

import { resetGame } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  try {
    await resetGame();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zresetować gry", error);
    return NextResponse.json({ error: "Nie udało się zresetować gry." }, { status: 500 });
  }
}
