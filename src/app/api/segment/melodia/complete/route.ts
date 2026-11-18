import { NextRequest, NextResponse } from "next/server";

import { completeMelodiaSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await completeMelodiaSegment())) return NextResponse.json({ error: "Wyniki nie są jeszcze gotowe do zakończenia segmentu." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zakończyć melodii", error);
    return NextResponse.json({ error: "Nie udało się zakończyć segmentu." }, { status: 500 });
  }
}
