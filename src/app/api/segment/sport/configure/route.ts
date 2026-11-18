import { NextRequest, NextResponse } from "next/server";

import { configureSportSetup } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { sportSetupSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = sportSetupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowa konfiguracja Sportu." }, { status: 400 });
  try {
    if (!(await configureSportSetup(parsed.data))) return NextResponse.json({ error: "Nie można teraz zapisać par i rang. Każdy aktywny zawodnik musi mieć unikalną rangę od 1 do końca listy swojej drużyny." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać ustawień Sportu", error);
    return NextResponse.json({ error: "Nie udało się zapisać ustawień Sportu." }, { status: 500 });
  }
}
