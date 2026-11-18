import { NextRequest, NextResponse } from "next/server";

import { AlkoholicyConflict } from "@/lib/alkoholicy";
import { applyAlkoholicyAction } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { alkoholicyActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });
    const parsed = alkoholicyActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Nieprawidłowe dane akcji segmentu ALKOHOLICY." }, { status: 400 });
    const role = parsed.data.command.action === "bet" ? "player" : "admin";
    if (session.role !== role) return NextResponse.json({ error: "Nie masz uprawnień do wykonania tej akcji." }, { status: 403 });
    await applyAlkoholicyAction(parsed.data, session.role === "player" ? session.playerId : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AlkoholicyConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Nie udało się zapisać akcji segmentu ALKOHOLICY", error);
    return NextResponse.json({ error: "Nie udało się zapisać akcji segmentu ALKOHOLICY." }, { status: 500 });
  }
}
