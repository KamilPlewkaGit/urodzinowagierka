import { NextRequest, NextResponse } from "next/server";

import { configureTheFloorDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { theFloorDuelConfigurationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = theFloorDuelConfigurationSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowy wybór drużyn." }, { status: 400 });
  try {
    if (!(await configureTheFloorDuel(parsed.data))) return NextResponse.json({ error: "Nie można teraz zatwierdzić tych drużyn." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się ustawić pojedynku The Floor", error);
    return NextResponse.json({ error: "Nie udało się ustawić pojedynku." }, { status: 500 });
  }
}
