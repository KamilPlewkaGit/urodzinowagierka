import { NextRequest, NextResponse } from "next/server";

import { moveToNextMelodiaSong } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await moveToNextMelodiaSong())) return NextResponse.json({ error: "Nie można teraz przejść do następnej piosenki." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się przejść do następnej piosenki", error);
    return NextResponse.json({ error: "Nie udało się przejść do następnej piosenki." }, { status: 500 });
  }
}
