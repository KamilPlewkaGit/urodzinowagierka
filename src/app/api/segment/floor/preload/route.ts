import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { reportTheFloorPreload } from "@/lib/database";
import { getTheFloorPreloadManifest } from "@/lib/floor-content";
import { getRequestSession, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

const reportSchema = z.object({
  deviceId: z.uuid(),
  version: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  decoded: z.number().int().min(0).max(250_000),
  failed: z.array(z.string().regex(/^\/api\/segment\/floor\/image\?asset=[a-f0-9]{64}$/)).max(256)
    .transform((urls) => [...new Set(urls)]),
}).refine((report) => report.version !== null || (report.decoded === 0 && report.failed.length === 0));

export async function GET(request: NextRequest) {
  const session = await getRequestSession(request);
  if (!session) return NextResponse.json({ error: "Sesja wygasła." }, { status: 401 });
  const manifest = await getTheFloorPreloadManifest();
  return NextResponse.json(manifest, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await getRequestSession(request);
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!session || !token) return NextResponse.json({ error: "Sesja wygasła." }, { status: 401 });
  const report = reportSchema.safeParse(await request.json().catch(() => null));
  if (!report.success) return NextResponse.json({ error: "Nieprawidłowy raport wczytywania zdjęć." }, { status: 400 });
  const { deviceId, version, decoded, failed } = report.data;
  try {
    const status = await reportTheFloorPreload(token, deviceId, version, decoded, failed, session.role === "admin");
    if (!status) return NextResponse.json({ error: "Odświeżono materiały The Floor. Ponów wczytywanie." }, { status: 409 });
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Nie udało się zapisać gotowości The Floor", error);
    return NextResponse.json({ error: "Nie udało się zsynchronizować wczytywania zdjęć." }, { status: 503 });
  }
}
