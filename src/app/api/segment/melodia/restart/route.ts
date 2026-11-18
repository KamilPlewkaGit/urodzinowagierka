import { NextRequest, NextResponse } from "next/server";

import { restartMelodiaSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  try {
    if (!(await restartMelodiaSegment())) {
      return NextResponse.json({ error: "Segment nie jest aktywny." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się uruchomić segmentu od początku", error);
    return NextResponse.json({ error: "Nie udało się uruchomić segmentu od początku." }, { status: 500 });
  }
}
