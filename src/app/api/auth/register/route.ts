import { NextRequest, NextResponse } from "next/server";

import { NicknameTakenError, createPlayer } from "@/lib/database";
import { createPlayerSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { isReservedNickname, normalizeNickname, playerRegistrationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { nickname?: unknown; teamId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A valid request body is required." }, { status: 400 });
  }

  const parsed = playerRegistrationSchema.safeParse({
    nickname: typeof body.nickname === "string" ? normalizeNickname(body.nickname) : body.nickname,
    teamId: body.teamId,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid player details." }, { status: 400 });
  }
  if (isReservedNickname(parsed.data.nickname)) {
    return NextResponse.json({ error: "The admin nickname is reserved." }, { status: 400 });
  }

  try {
    const player = await createPlayer(parsed.data);
    const response = NextResponse.json({ player }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, createPlayerSession(player.id), sessionCookieOptions);
    return response;
  } catch (error) {
    if (error instanceof NicknameTakenError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Player registration failed", error);
    return NextResponse.json({ error: "Unable to reserve a seat right now." }, { status: 500 });
  }
}
