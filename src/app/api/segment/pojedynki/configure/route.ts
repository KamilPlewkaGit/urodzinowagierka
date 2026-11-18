import { NextRequest, NextResponse } from "next/server";

import { configurePojedynkiDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { pojedynkiDuelConfigurationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = pojedynkiDuelConfigurationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowy wybór drużyn." }, { status: 400 });
  try {
    if (!(await configurePojedynkiDuel(parsed.data))) return NextResponse.json({ error: "Nie można teraz zatwierdzić drużyn do pojedynku." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się skonfigurować pojedynku", error);
    return NextResponse.json({ error: "Nie udało się zatwierdzić drużyn." }, { status: 500 });
  }
}
