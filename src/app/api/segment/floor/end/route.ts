import { NextRequest, NextResponse } from "next/server";

import { endTheFloorDuel } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { theFloorWinnerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 }); }
  const parsed = theFloorWinnerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Wybrano nieprawidłową zwycięską drużynę." }, { status: 400 });
  try {
    if (!(await endTheFloorDuel(parsed.data.winnerTeamId))) return NextResponse.json({ error: "Nie można teraz zatwierdzić wyniku pojedynku." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się ręcznie zakończyć The Floor", error);
    return NextResponse.json({ error: "Nie udało się zakończyć pojedynku." }, { status: 500 });
  }
}
