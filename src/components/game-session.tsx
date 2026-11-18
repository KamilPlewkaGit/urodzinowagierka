"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { CasinoLogo } from "@/components/casino-logo";
import { FloorScreen } from "@/components/floor-screen";
import { GameScreen } from "@/components/game-screen";
import { MelodiaScreen } from "@/components/melodia-screen";
import { PojedynkiScreen } from "@/components/pojedynki-screen";
import { SportScreen } from "@/components/sport-screen";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import type { GameSnapshot, SegmentId } from "@/lib/types";

export function useGameSession(initialSnapshot: GameSnapshot, viewerPlayerId?: number) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [syncError, setSyncError] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const polling = useRef(false);
  const request = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!polling.current) return;
    // A post-bet refresh must start after the wager write has completed.
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 3 * POLL_INTERVAL_MS);

    try {
      const response = await fetch("/api/game/state", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401) {
        polling.current = false;
        router.replace("/");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error();
      const next: GameSnapshot = await response.json();
      if (controller.signal.aborted) return;
      if (viewerPlayerId !== undefined && !next.players.some((player) => player.id === viewerPlayerId)) {
        polling.current = false;
        router.replace("/");
        router.refresh();
        return;
      }
      setSnapshot(next);
      setSyncError(false);
    } catch {
      if (polling.current && request.current === controller) setSyncError(true);
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }, [router, viewerPlayerId]);

  useEffect(() => {
    polling.current = true;
    const interval = window.setInterval(() => {
      if (!request.current) void refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      polling.current = false;
      window.clearInterval(interval);
      request.current?.abort();
    };
  }, [refresh]);

  async function leave() {
    setLeaving(true);
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      polling.current = false;
      request.current?.abort();
      router.replace("/");
      router.refresh();
    } catch {
      setLogoutError(true);
      setLeaving(false);
    }
  }

  return { snapshot, refresh, syncError, leave, leaving, logoutError };
}

const segmentScreens = {
  solenizant: GameScreen,
  "the-floor": FloorScreen,
  sport: SportScreen,
  melodia: MelodiaScreen,
  pojedynki: PojedynkiScreen,
} satisfies Record<SegmentId, typeof FloorScreen>;

export function ActiveSegment({ snapshot, refresh, viewerPlayerId }: {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerPlayerId?: number;
}) {
  const Screen = segmentScreens[snapshot.game.activeSegment];
  return <Screen snapshot={snapshot} refresh={refresh} viewerRole={viewerPlayerId === undefined ? "admin" : "player"} viewerPlayerId={viewerPlayerId} />;
}

export function AdminGamePreview({ initialSnapshot }: { initialSnapshot: GameSnapshot }) {
  const router = useRouter();
  const { snapshot, refresh, syncError, leave, leaving, logoutError } = useGameSession(initialSnapshot);
  const waiting = snapshot.game.status === "waiting";

  useEffect(() => {
    if (waiting) router.replace("/admin");
  }, [router, waiting]);

  return (
    <main className="app-shell game-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="sync-indicator"><i /> Segment na żywo</span>
          <button type="button" className="quiet-button" onClick={() => router.push("/admin")}>Panel prowadzącego</button>
          <button type="button" className="quiet-button" disabled={leaving} onClick={leave}>Wyjdź</button>
        </div>
      </header>
      {syncError && <p className="sync-warning" role="status">Połączenie z grą jest chwilowo niedostępne. Ponawiamy próbę…</p>}
      {logoutError && <p className="form-error" role="alert">Nie udało się wylogować. Spróbuj ponownie.</p>}
      {!waiting && <ActiveSegment snapshot={snapshot} refresh={refresh} />}
    </main>
  );
}
