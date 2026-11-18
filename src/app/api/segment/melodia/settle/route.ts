import { NextRequest, NextResponse } from "next/server";

import { settleMelodiaReward } from "@/lib/database";
import { getRequestSession } from "@/lib/session";
import { melodiaWinnerSchema } from "@/lib/validation";

export const runtime = "nodejs";

const settlementErrors = {
  not_ready: "Wyniki uległy zmianie albo nagroda została już rozliczona.",
  empty_roster: "Rozliczenie wymaga aktywnych zawodników po obu stronach.",
  insufficient: "Co najmniej jeden zawodnik przegranej drużyny ma za mało żetonów na swoją część nagrody. Salda pozostały bez zmian.",
  balance_limit: "Nagroda przekroczyłaby maksymalne saldo zawodnika. Salda pozostały bez zmian.",
};

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Wymagane jest uprawnienie administratora." }, { status: 403 });
  }

  const parsed = melodiaWinnerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Nieprawidłowe dane." }, { status: 400 });
  }

  try {
    const status = await settleMelodiaReward(parsed.data);
    if (status !== "settled") {
      return NextResponse.json({ error: settlementErrors[status] }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Nie udało się rozliczyć żetonów", error);
    return NextResponse.json({ error: "Nie udało się rozliczyć żetonów." }, { status: 500 });
  }
}
