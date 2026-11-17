import { NextResponse } from "next/server";

import { getGameSnapshot } from "@/lib/database";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getGameSnapshot();
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Game state request failed", error);
    return NextResponse.json({ error: "Game state is temporarily unavailable." }, { status: 503 });
  }
}
