import { NextRequest, NextResponse } from "next/server";

import { deactivatePlayer } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { adminPlayerRemovalSchema } from "@/lib/validation";

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

  const parsed = adminPlayerRemovalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Wybrano nieprawidłowego gracza." }, { status: 400 });
  }

  try {
    const player = await deactivatePlayer(parsed.data.playerId);
    if (!player) {
      return NextResponse.json({ error: "Ten gracz nie jest już aktywny." }, { status: 404 });
    }
    return NextResponse.json({ player });
  } catch (error) {
    console.error("Nie udało się usunąć gracza", error);
    return NextResponse.json({ error: "Nie udało się usunąć gracza." }, { status: 500 });
  }
}
