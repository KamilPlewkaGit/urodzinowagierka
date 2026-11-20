"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { TheFloorPrompt } from "@/lib/types";

type ImageCard = { url: string; alt: string };
type ImageStatus = { url: string; status: "waiting" | "failed" };

export function FloorPrompt({ prompt, alt, admin = false }: {
  prompt: TheFloorPrompt | null;
  alt: string;
  admin?: boolean;
}) {
  const url = prompt?.kind === "image" ? prompt.url : null;
  const candidate = useRef<HTMLImageElement>(null);
  const [displayed, setDisplayed] = useState<ImageCard | null>(null);
  const [loading, setLoading] = useState<ImageStatus | null>(null);
  const displayedUrl = displayed?.url;
  const latestAlt = useRef(alt);

  useEffect(() => {
    latestAlt.current = alt;
  }, [alt]);

  useEffect(() => {
    if (!url) {
      setDisplayed(null);
      setLoading(null);
      return;
    }
    if (url === displayedUrl) {
      setLoading(null);
      return;
    }
    const image = candidate.current;
    if (!image) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && candidate.current === image;

    // A slow request must not leave a playable previous card on screen.
    const grace = window.setTimeout(() => { if (isCurrent()) setLoading({ url, status: "waiting" }); }, 250);
    const timeout = window.setTimeout(() => {
      if (isCurrent()) setLoading({ url, status: "failed" });
      cancelled = true;
    }, 8_000);
    image.decode().then(() => {
      if (isCurrent()) setDisplayed({ url, alt: latestAlt.current });
    }).catch(() => {
      if (isCurrent()) setLoading({ url, status: "failed" });
    }).finally(() => {
      window.clearTimeout(grace);
      window.clearTimeout(timeout);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(grace);
      window.clearTimeout(timeout);
    };
  }, [url, displayedUrl]);

  const status = loading?.url === url ? loading?.status : undefined;
  const showPrevious = Boolean(url && displayed && displayed.url !== url && !loading);
  const visibleUrl = showPrevious ? displayedUrl : url === displayedUrl ? url : null;
  const cards: ImageCard[] = [];
  if (url && displayed && displayed.url !== url) cards.push(displayed);
  if (url) cards.push({ url, alt });

  return (
    <div className={`floor-prompt-frame${admin ? " floor-admin-prompt-frame" : ""}`}>
      {prompt?.kind === "text" ? (
        <div className="floor-text-prompt">
          <strong style={{ "--floor-prompt-length": Array.from(prompt.text).length } as CSSProperties}>{prompt.text}</strong>
        </div>
      ) : (
        <>
          {cards.map((card) => (
            <img key={card.url} ref={card.url === url ? candidate : undefined} src={card.url}
              className="floor-prompt-image" data-visible={card.url === visibleUrl}
              alt={card.url === visibleUrl ? card.alt : ""} aria-hidden={card.url !== visibleUrl}
              decoding="async" referrerPolicy="no-referrer" />
          ))}
          {!visibleUrl && <p className="floor-prompt-status" role="status">
            {prompt?.kind === "error" ? prompt.message : status === "failed" ? "Nie udało się wczytać obrazu." : "Wczytywanie planszy…"}
          </p>}
        </>
      )}
    </div>
  );
}
