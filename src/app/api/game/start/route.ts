import { NextRequest, NextResponse } from "next/server";

import { startGame } from "@/lib/database";
import { getRequestSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Administrator authorization is required." }, { status: 403 });
  }

  try {
    return NextResponse.json({ game: await startGame() });
  } catch (error) {
    console.error("Game start failed", error);
    return NextResponse.json({ error: "Unable to start the game right now." }, { status: 500 });
  }
}
