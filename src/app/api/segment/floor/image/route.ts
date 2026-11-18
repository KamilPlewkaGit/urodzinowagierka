import { z } from "zod";

import { getTheFloorEmbeddedImage } from "@/lib/floor-content";

export const runtime = "nodejs";

const imageQuery = z.object({
  category: z.string().regex(/^[a-z-]+$/).max(32),
  item: z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().max(32_767)),
});

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = imageQuery.safeParse({ category: params.get("category"), item: params.get("item") });
  if (!query.success) return Response.json({ error: "Nieprawidłowa kategoria lub numer grafiki." }, { status: 400 });

  const image = await getTheFloorEmbeddedImage(query.data.category, query.data.item);
  if (!image) return Response.json({ error: "Nie znaleziono grafiki kategorii." }, { status: 404 });

  return new Response(new Uint8Array(Buffer.from(image.base64, "base64")), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
