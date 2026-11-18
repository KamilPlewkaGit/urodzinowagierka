"use client";

import { useState } from "react";

import type { TheFloorPrompt } from "@/lib/types";

export function FloorPrompt({ prompt, alt, admin = false }: {
  prompt: TheFloorPrompt | null;
  alt: string;
  admin?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!prompt) return null;
  if (prompt.kind === "error") return <p className="form-error" role="alert">{prompt.message}</p>;
  if (prompt.kind === "text") {
    return <p className="floor-waiting p-4 text-center">
      <strong className="break-words font-serif text-4xl sm:text-5xl">{prompt.text}</strong>
    </p>;
  }
  if (failedUrl === prompt.url) return <p className="form-error" role="alert">Nie udało się wyświetlić obrazu. Przejdź do następnej pozycji.</p>;

  return <img className={admin ? "floor-prompt-image floor-admin-image" : "floor-prompt-image"}
    src={prompt.url} onError={() => setFailedUrl(prompt.url)} alt={alt} referrerPolicy="no-referrer" />;
}
