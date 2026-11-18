import { NextRequest, NextResponse } from "next/server";

import { NicknameTakenError, createPlayer, findActivePlayerByNickname } from "@/lib/database";
import { createPlayerSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { isReservedNickname, nicknameSchema, normalizeNickname, playerRegistrationSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: { nickname?: unknown; teamId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Wymagane jest poprawne ciało żądania." }, { status: 400 });
  }

  const nickname = nicknameSchema.safeParse(
    typeof body.nickname === "string" ? normalizeNickname(body.nickname) : body.nickname,
  );
  if (!nickname.success) {
    return NextResponse.json({ error: nickname.error.issues[0]?.message ?? "Nieprawidłowy pseudonim." }, { status: 400 });
  }
  if (isReservedNickname(nickname.data)) {
    return NextResponse.json({ error: "Pseudonim admin jest zarezerwowany." }, { status: 400 });
  }

  try {
    const returningPlayer = await findActivePlayerByNickname(nickname.data);
    if (returningPlayer) {
      const response = NextResponse.json({ player: returningPlayer, rejoined: true });
      response.cookies.set(SESSION_COOKIE, await createPlayerSession(returningPlayer.id), sessionCookieOptions);
      return response;
    }

    const parsed = playerRegistrationSchema.safeParse({ nickname: nickname.data, teamId: body.teamId });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane gracza." }, { status: 400 });
    }
    const player = await createPlayer(parsed.data);
    const response = NextResponse.json({ player }, { status: 201 });
    response.cookies.set(SESSION_COOKIE, await createPlayerSession(player.id), sessionCookieOptions);
    return response;
  } catch (error) {
    if (error instanceof NicknameTakenError) {
      // Another request may have registered the nickname after our initial lookup.
      const returningPlayer = await findActivePlayerByNickname(nickname.data);
      if (returningPlayer) {
        const response = NextResponse.json({ player: returningPlayer, rejoined: true });
        response.cookies.set(SESSION_COOKIE, await createPlayerSession(returningPlayer.id), sessionCookieOptions);
        return response;
      }
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Nie udało się zarejestrować gracza", error);
    return NextResponse.json({ error: "Nie udało się teraz zarezerwować miejsca." }, { status: 500 });
  }
}
