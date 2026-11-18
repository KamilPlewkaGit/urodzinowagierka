import { NextRequest, NextResponse } from "next/server";

import { startSportChallenges } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await startSportChallenges())) return NextResponse.json({ error: "Najpierw zatwierdź obie pary oraz pełne rangi wszystkich aktywnych graczy. Każda drużyna musi mieć co najmniej pięć rang do harmonogramu." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się otworzyć wyzwań Sportu", error);
    return NextResponse.json({ error: "Nie udało się otworzyć wyzwań Sportu." }, { status: 500 });
  }
}
