import { NextRequest, NextResponse } from "next/server";

import { configureSportBonusRequirements } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { sportBonusRequirementsSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = sportBonusRequirementsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe wymagania bonusowe." }, { status: 400 });
  try {
    if (!(await configureSportBonusRequirements(parsed.data))) return NextResponse.json({ error: "Nie można teraz zapisać wymagań bonusowych." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać wymagań bonusowych", error);
    return NextResponse.json({ error: "Nie udało się zapisać wymagań bonusowych." }, { status: 500 });
  }
}
