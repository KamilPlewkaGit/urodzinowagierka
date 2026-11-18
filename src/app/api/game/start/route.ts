import { NextRequest, NextResponse } from "next/server";

import { startGame } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  try {
    return NextResponse.json({ game: await startGame() });
  } catch (error) {
    console.error("Nie udało się rozpocząć gry", error);
    return NextResponse.json({ error: "Nie udało się teraz rozpocząć gry." }, { status: 500 });
  }
}
