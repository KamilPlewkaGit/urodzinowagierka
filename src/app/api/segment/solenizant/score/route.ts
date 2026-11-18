import { NextRequest, NextResponse } from "next/server";

import { confirmSolenizantScore } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { solenizantScoreSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  let body: { questionIndex?: unknown; teamIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const parsed = solenizantScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane punktacji." }, { status: 400 });
  }

  try {
    if (!await confirmSolenizantScore(parsed.data)) {
      return NextResponse.json({ error: "To pytanie zostało już rozliczone albo nie jest gotowe do punktacji." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać punktacji segmentu Solenizant", error);
    return NextResponse.json({ error: "Nie udało się zapisać punktacji. Spróbuj ponownie." }, { status: 500 });
  }
}
