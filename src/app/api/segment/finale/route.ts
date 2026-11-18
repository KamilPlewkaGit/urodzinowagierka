import { NextRequest, NextResponse } from "next/server";

import { applyFinaleAction } from "@/lib/database";
import { FinaleConflict } from "@/lib/finale";
import { getRequestSession } from "@/lib/session";
import { finaleActionSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getRequestSession(request);
    if (!session) return NextResponse.json({ error: "Sesja wygasła. Zaloguj się ponownie." }, { status: 401 });
    if (session.role !== "admin") return NextResponse.json({ error: "Tylko prowadzący może sterować finałem." }, { status: 403 });

    const parsed = finaleActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Nieprawidłowe dane akcji finału." }, { status: 400 });

    await applyFinaleAction(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FinaleConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("Nie udało się zapisać akcji finału", error);
    return NextResponse.json({ error: "Nie udało się zapisać akcji finału." }, { status: 500 });
  }
}
