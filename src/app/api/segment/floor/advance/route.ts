import { NextRequest, NextResponse } from "next/server";

import { advanceTheFloorDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { theFloorAdvanceSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = theFloorAdvanceSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Nieprawidłowa akcja pojedynku." }, { status: 400 });
  try {
    if (!(await advanceTheFloorDuel(parsed.data.action))) return NextResponse.json({ error: "Pojedynek nie jest aktywny." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się przesunąć pojedynku The Floor", error);
    return NextResponse.json({ error: "Nie udało się zapisać akcji pojedynku." }, { status: 500 });
  }
}
