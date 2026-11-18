import { NextRequest, NextResponse } from "next/server";

import { resolveMelodiaTie } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { melodiaWinnerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  const parsed = melodiaWinnerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
  }

  try {
    if (!(await resolveMelodiaTie(parsed.data))) {
      return NextResponse.json({ error: "Wybierz jedną z drużyn remisujących na pierwszym miejscu." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozstrzygnąć remisu", error);
    return NextResponse.json({ error: "Nie udało się rozstrzygnąć remisu." }, { status: 500 });
  }
}
