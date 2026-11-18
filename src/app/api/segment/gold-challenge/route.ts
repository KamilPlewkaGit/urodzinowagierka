import { NextRequest, NextResponse } from "next/server";

import { applyGoldAction } from "@/lib/database";
import { GoldConflict } from "@/lib/gold-challenge";
import { getRequestSession } from "@/lib/session";
import { goldActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });
    const parsed = goldActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Nieprawidłowe dane akcji złotego wyzwania." }, { status: 400 });
    const role = parsed.data.command.action === "nominate" ? "player" : "admin";
    if (session.role !== role) return NextResponse.json({ error: "Nie masz uprawnień do wykonania tej akcji." }, { status: 403 });
    await applyGoldAction(parsed.data, session.role === "player" ? session.playerId : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof GoldConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Nie udało się zapisać akcji złotego wyzwania", error);
    return NextResponse.json({ error: "Nie udało się zapisać akcji złotego wyzwania." }, { status: 500 });
  }
}
