import { z } from "zod";

import { getTheFloorImage } from "@/lib/floor-content";

export const runtime = "nodejs";

const imageQuery = z.object({
  category: z.string().regex(/^[a-z-]+$/).max(32),
  item: z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().max(32_767)),
});
const imageHosts = new Set(["upload.wikimedia.org", "static2.zawszepomorze.pl", "www.zawszepomorze.pl", "www.wejherowo.pl", "www.aquaparkreda.pl", "aquaparkreda.pl"]);
const imageTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function raster(body: BodyInit, mime: string) {
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function fetchRaster(url: URL) {
  const signal = AbortSignal.timeout(5000);
  for (let attempt = 0; attempt < 3; attempt++) {
    if (url.protocol !== "https:" || !imageHosts.has(url.host) || url.username || url.password) {
      throw new Error("Nieznane źródło obrazu");
    }
    const response = await fetch(url, { redirect: "manual", signal, next: { revalidate: 3600 } });
    const location = response.headers.get("location");
    if (!location || !redirectStatuses.has(response.status)) return response;
    await response.body?.cancel();
    url = new URL(location, url);
  }
  throw new Error("Za dużo przekierowań do obrazu");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = imageQuery.safeParse({ category: params.get("category"), item: params.get("item") });
  if (!query.success) return Response.json({ error: "Nieprawidłowa kategoria lub numer grafiki." }, { status: 400 });

  const image = await getTheFloorImage(query.data.category, query.data.item);
  if (!image) return Response.json({ error: "Nie znaleziono grafiki kategorii." }, { status: 404 });

  if (image.kind === "embedded") {
    return raster(new Uint8Array(Buffer.from(image.image.base64, "base64")), image.image.mime);
  }

  try {
    const upstream = await fetchRaster(new URL(image.url));
    const mime = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!upstream.ok || !upstream.body || !imageTypes.has(mime)) {
      await upstream.body?.cancel();
      throw new Error(`HTTP ${upstream.status}, typ ${mime}`);
    }
    return raster(upstream.body, mime);
  } catch (error) {
    console.warn("[The Floor] Nie udało się pobrać obrazu", query.data, error);
    return Response.json({ error: "Nie udało się pobrać obrazu kategorii." }, { status: 502 });
  }
}
