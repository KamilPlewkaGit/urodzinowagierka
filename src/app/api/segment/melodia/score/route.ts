import { NextRequest, NextResponse } from "next/server";

import { scoreMelodiaSong } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { melodiaScoreSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = melodiaScoreSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowa punktacja." }, { status: 400 });
  try {
    if (!(await scoreMelodiaSong(parsed.data))) return NextResponse.json({ error: "Nie można teraz zatwierdzić punktów. Przy licytacji zwycięzca piosenki musi być zwycięskim licytantem." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać punktacji melodii", error);
    return NextResponse.json({ error: "Nie udało się zapisać punktacji." }, { status: 500 });
  }
}
