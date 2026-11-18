import { NextRequest, NextResponse } from "next/server";

import { restartSportSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    await restartSportSegment();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się uruchomić Sportu od początku", error);
    return NextResponse.json({ error: "Nie udało się uruchomić Sportu od początku." }, { status: 500 });
  }
}
