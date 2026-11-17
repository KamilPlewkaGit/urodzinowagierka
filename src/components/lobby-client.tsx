"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { POLL_INTERVAL_MS, TEAMS, getTeam } from "@/lib/constants";
import type { GameSnapshot, Player } from "@/lib/types";

interface LobbyClientProps {
  player: Player;
  initialSnapshot: GameSnapshot;
}

export function LobbyClient({ player, initialSnapshot }: LobbyClientProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [syncError, setSyncError] = useState(false);
  const currentPlayer = useMemo(
    () => snapshot.players.find((candidate) => candidate.id === player.id) ?? player,
    [player, snapshot.players],
  );
  const team = getTeam(currentPlayer.teamId);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");
      const nextSnapshot = (await response.json()) as GameSnapshot;
      setSnapshot(nextSnapshot);
      setSyncError(false);
      if (nextSnapshot.game.status === "started") router.replace("/game");
    } catch {
      setSyncError(true);
    }
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function leaveTable() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="sync-indicator"><i /> Live lobby</span>
          <button className="quiet-button" onClick={leaveTable}>Leave</button>
        </div>
      </header>

      <section className="lobby-hero">
        <div>
          <span className="eyebrow">Private game lounge</span>
          <h1>Welcome, <em>{currentPlayer.nickname}</em>.</h1>
          <p>Waiting for the administrator to start the game.</p>
        </div>
        <div className="hero-chip" aria-label={`${currentPlayer.tokens} casino chips`}>
          <span>♛</span><strong>{currentPlayer.tokens}</strong><small>CHIPS</small>
        </div>
      </section>

      <section className="player-summary-grid" aria-label="Your player details">
        <article className="summary-card">
          <span className="summary-label">Your house</span>
          <strong className="house-value" style={{ color: team.color }}><span>{team.icon}</span>{team.name}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Your stack</span>
          <strong>{currentPlayer.tokens} <small>chips</small></strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">At the table</span>
          <strong>{snapshot.players.length} <small>players</small></strong>
        </article>
      </section>

      <section className="roster-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Table roster</span>
            <h2>Houses at the table</h2>
          </div>
          {syncError ? <span className="sync-warning">Reconnecting…</span> : <span className="poll-note">Updates every 4 seconds</span>}
        </div>
        <div className="roster-grid">
          {TEAMS.map((house) => {
            const members = snapshot.players.filter((candidate) => candidate.teamId === house.id);
            return (
              <article className="house-card" key={house.id} style={{ "--team-color": house.color, "--team-soft": house.softColor } as CSSProperties}>
                <div className="house-card-header">
                  <span className="house-symbol" aria-hidden="true">{house.icon}</span>
                  <div><h3>{house.name}</h3><p>{members.length} {members.length === 1 ? "player" : "players"}</p></div>
                </div>
                <div className="member-list">
                  {members.length ? members.map((member) => (
                    <div className={`member-row ${member.id === player.id ? "is-you" : ""}`} key={member.id}>
                      <span className="member-avatar">{member.nickname.slice(0, 1).toUpperCase()}</span>
                      <span>{member.nickname}{member.id === player.id ? <small>YOU</small> : null}</span>
                      <strong>{member.tokens}</strong>
                    </div>
                  )) : <p className="empty-house">Awaiting a player…</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
