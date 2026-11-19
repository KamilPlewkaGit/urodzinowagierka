import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { startTheFloorDuel } from "@/lib/database";
import { getRequestSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session || session.role !== "admin" || !token) return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  const parsed = z.object({ deviceId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Brakuje identyfikatora urządzenia prowadzącego." }, { status: 400 });
  try {
    const status = await startTheFloorDuel(token, parsed.data.deviceId);
    if (status === "assets") return NextResponse.json({ error: "Popraw wskazane błędy w materiałach The Floor przed rozpoczęciem pojedynku." }, { status: 409 });
    if (status === "loading") return NextResponse.json({ error: "Poczekaj, aż zdjęcia wczytają się na urządzeniu prowadzącego i u wszystkich połączonych graczy." }, { status: 409 });
    if (status !== "started") return NextResponse.json({ error: "Nie można teraz zamknąć zakładów i rozpocząć pojedynku." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozpocząć pojedynku The Floor", error);
    return NextResponse.json({ error: "Nie udało się rozpocząć pojedynku." }, { status: 500 });
  }
}
