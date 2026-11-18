"use client";

import { type CSSProperties, useState } from "react";

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
    return (
      <div className={admin ? "floor-text-prompt floor-admin-text-prompt" : "floor-text-prompt"}>
        <strong style={{ "--floor-prompt-length": Array.from(prompt.text).length } as CSSProperties}>{prompt.text}</strong>
      </div>
    );
  }
  if (failedUrl === prompt.url) return <p className="form-error" role="alert">Nie udało się wyświetlić obrazu. Przejdź do następnej pozycji.</p>;

  return <img className={admin ? "floor-prompt-image floor-admin-image" : "floor-prompt-image"}
    src={prompt.url} onError={() => setFailedUrl(prompt.url)} alt={alt} referrerPolicy="no-referrer" />;
}
