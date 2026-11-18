import { NextRequest, NextResponse } from "next/server";

import { getGameSnapshot } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) {
    return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });
  }

  try {
    const snapshot = await getGameSnapshot(
      session.role === "player" ? session.playerId : undefined,
      { familiadaAdmin: session.role === "admin" },
    );
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Nie udało się pobrać stanu gry", error);
    return NextResponse.json({ error: "Stan gry jest chwilowo niedostępny." }, { status: 503 });
  }
}
