import { NextRequest, NextResponse } from "next/server";

import { completePojedynkiSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  try {
    if (!(await completePojedynkiSegment())) return NextResponse.json({ error: "Wyniki wszystkich pojedynków nie są jeszcze gotowe." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zakończyć segmentu Pojedynki", error);
    return NextResponse.json({ error: "Nie udało się zakończyć segmentu." }, { status: 500 });
  }
}
