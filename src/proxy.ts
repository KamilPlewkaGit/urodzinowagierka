import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  let path: string;
  try {
    path = decodeURIComponent(request.nextUrl.pathname).replaceAll("\\", "/");
  } catch {
    return NextResponse.next();
  }
  if (/^\/+(?:the floor|floor)(?:\/|$)/i.test(path) &&
      !/^\/the floor\/(?:[^/.][^/]*\/)*[^/.][^/]*\.(?:avif|gif|jpe?g|png|webp)$/i.test(path)) {
    return NextResponse.json({ error: "Nie znaleziono zasobu." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static).*)"],
};
