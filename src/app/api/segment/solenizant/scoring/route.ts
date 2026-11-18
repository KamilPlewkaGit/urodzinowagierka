import { NextRequest, NextResponse } from "next/server";

import { openSolenizantScoring } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { solenizantScoringStageSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  let body: { questionIndex?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const parsed = solenizantScoringStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane pytania." }, { status: 400 });
  }

  try {
    if (!await openSolenizantScoring(parsed.data.questionIndex)) {
      return NextResponse.json({ error: "To pytanie nie jest gotowe do punktacji." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się otworzyć punktacji segmentu Solenizant", error);
    return NextResponse.json({ error: "Nie udało się otworzyć punktacji. Spróbuj ponownie." }, { status: 500 });
  }
}
