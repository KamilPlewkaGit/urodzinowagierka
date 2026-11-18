import { NextRequest, NextResponse } from "next/server";

import { startSolenizantSegment } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  try {
    const game = await startSolenizantSegment();
    if (!game) {
      return NextResponse.json({ error: "Nie można teraz rozpocząć segmentu." }, { status: 409 });
    }
    return NextResponse.json({ game });
  } catch (error) {
    console.error("Nie udało się rozpocząć segmentu Solenizant", error);
    return NextResponse.json({ error: "Nie udało się rozpocząć segmentu. Spróbuj ponownie." }, { status: 500 });
  }
}
