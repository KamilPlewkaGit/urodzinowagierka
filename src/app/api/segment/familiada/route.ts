import { NextRequest, NextResponse } from "next/server";

import { applyFamiliadaAction } from "@/lib/database";
import { FamiliadaConflict } from "@/lib/familiada";
import { getRequestSession } from "@/lib/session";
import { familiadaActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });

    const parsed = familiadaActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Nieprawidłowe dane akcji Familiady." }, { status: 400 });
    const playerAction = parsed.data.command.action === "buzz" || parsed.data.command.action === "bet";
    if (playerAction ? session.role !== "player" : session.role !== "admin") {
      return NextResponse.json({ error: "Nie masz uprawnień do tej akcji." }, { status: 403 });
    }

    await applyFamiliadaAction(parsed.data, session.role === "player" ? session.playerId : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FamiliadaConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Nie udało się zapisać akcji Familiady", error);
    return NextResponse.json({ error: "Nie udało się zapisać akcji Familiady." }, { status: 500 });
  }
}
