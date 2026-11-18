import { NextRequest, NextResponse } from "next/server";

import { setActiveSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { activeSegmentSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const parsed = activeSegmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Wybrano nieprawidłowy segment." }, { status: 400 });
  }

  try {
    await setActiveSegment(parsed.data.segmentId);
    return NextResponse.json({ segmentId: parsed.data.segmentId });
  } catch (error) {
    console.error("Nie udało się zmienić aktywnego segmentu", error);
    return NextResponse.json({ error: "Nie udało się zmienić aktywnego segmentu." }, { status: 500 });
  }
}
