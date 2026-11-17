"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { POLL_INTERVAL_MS, TEAMS } from "@/lib/constants";
import type { GameSnapshot } from "@/lib/types";

interface GameScreenProps {
  initialSnapshot: GameSnapshot;
  viewerRole: "player" | "admin";
}

export function GameScreen({ initialSnapshot, viewerRole }: GameScreenProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [syncError, setSyncError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");
      setSnapshot((await response.json()) as GameSnapshot);
      setSyncError(false);
    } catch {
      setSyncError(true);
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const totalChips = useMemo(() => snapshot.players.reduce((sum, player) => sum + player.tokens, 0), [snapshot.players]);

  async function leave() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="app-shell game-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="sync-indicator"><i /> Game live</span>
          {viewerRole === "admin" ? <button className="quiet-button" onClick={() => router.push("/admin")}>Command table</button> : null}
          <button className="quiet-button" onClick={leave}>Leave</button>
        </div>
      </header>

      <section className="game-stage">
        <div className="game-stage-glow" />
        <div className="game-stage-content">
          <span className="eyebrow">The Grand Table · live</span>
          <h1>The cards are <em>in motion.</em></h1>
          <p>The game has started. Future rounds and casino mechanics will appear here without changing the team or wallet foundations.</p>
          <div className="live-figure"><strong>{totalChips}</strong><span>chips at the table</span></div>
        </div>
        <div className="table-felt" aria-hidden="true"><span>♠</span><span>♦</span><span>♣</span><span>♥</span></div>
      </section>

      <section className="score-section">
        <div className="section-heading">
          <div><span className="eyebrow">Table view</span><h2>Team stacks</h2></div>
          {syncError ? <span className="sync-warning">Reconnecting…</span> : <span className="poll-note">Live balance sync</span>}
        </div>
        <div className="score-grid">
          {TEAMS.map((team) => {
            const members = snapshot.players.filter((player) => player.teamId === team.id);
            const chips = members.reduce((sum, player) => sum + player.tokens, 0);
            return (
              <article className="score-card" key={team.id} style={{ "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties}>
                <span className="score-symbol">{team.icon}</span>
                <h3>{team.name}</h3>
                <strong>{chips}</strong><span className="score-caption">team chips · {members.length} {members.length === 1 ? "player" : "players"}</span>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
