import { NextRequest, NextResponse } from "next/server";

import { scoreMelodiaSong } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { melodiaScoreSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  const parsed = melodiaScoreSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
  }

  try {
    if (!(await scoreMelodiaSong(parsed.data))) {
      return NextResponse.json({ error: "Nie można teraz zatwierdzić punktów tej piosenki." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zapisać punktacji", error);
    return NextResponse.json({ error: "Nie udało się zapisać punktacji." }, { status: 500 });
  }
}
