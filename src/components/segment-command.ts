"use client";

import { useRef, useState } from "react";

export function useSegmentCommand<Command>(endpoint: string, revision: string, refresh: () => Promise<void>) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send(command: Command) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, command }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setError(payload?.error ?? "Nie udało się zapisać akcji.");
      }
      await refresh();
    } catch {
      setError("Połączenie z grą jest chwilowo niedostępne.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { send, pending, error };
}
