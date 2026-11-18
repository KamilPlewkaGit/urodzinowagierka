import { NextRequest, NextResponse } from "next/server";

import { completeMelodiaSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { melodiaSongSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  const parsed = melodiaSongSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
  }

  try {
    if (!(await completeMelodiaSegment(parsed.data.songId))) {
      return NextResponse.json({ error: "Najpierw zatwierdź rozliczenie żetonów." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się zakończyć segmentu", error);
    return NextResponse.json({ error: "Nie udało się zakończyć segmentu." }, { status: 500 });
  }
}
