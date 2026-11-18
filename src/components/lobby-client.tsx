"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { POLL_INTERVAL_MS, TEAMS, getTeam } from "@/lib/constants";
import { formatChips } from "@/lib/chips";
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
      if (response.status === 401) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("Nie udało się pobrać stanu gry.");
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
          <span className="sync-indicator"><i /> Lobby na żywo</span>
          <button className="quiet-button" onClick={leaveTable}>Wyjdź</button>
        </div>
      </header>

      <section className="lobby-hero">
        <div>
          <span className="eyebrow">Prywatny salon gry</span>
          <h1>Witaj, <em>{currentPlayer.nickname}</em>.</h1>
          <p>Czekamy, aż prowadzący rozpocznie grę.</p>
        </div>
        <div className="hero-chip" aria-label={`${formatChips(currentPlayer.tokens)} żetonów kasynowych`}>
          <span>♛</span><strong>{formatChips(currentPlayer.tokens)}</strong><small>ŻETONY</small>
        </div>
      </section>

      <section className="player-summary-grid" aria-label="Dane gracza">
        <article className="summary-card">
          <span className="summary-label">Twoja drużyna</span>
          <strong className="house-value" style={{ color: team.color }}><span>{team.icon}</span>{team.name}</strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Twoje żetony</span>
          <strong>{formatChips(currentPlayer.tokens)} <small>żetonów</small></strong>
        </article>
        <article className="summary-card">
          <span className="summary-label">Przy stole</span>
          <strong>{snapshot.players.length} <small>graczy</small></strong>
        </article>
      </section>

      <section className="roster-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Skład stołu</span>
            <h2>Drużyny przy stole</h2>
          </div>
          {syncError ? <span className="sync-warning">Ponowne łączenie…</span> : <span className="poll-note">Odświeżanie co 4 sekundy</span>}
        </div>
        <div className="roster-grid">
          {TEAMS.map((house) => {
            const members = snapshot.players.filter((candidate) => candidate.teamId === house.id);
            return (
              <article className="house-card" key={house.id} style={{ "--team-color": house.color, "--team-soft": house.softColor } as CSSProperties}>
                <div className="house-card-header">
                  <span className="house-symbol" aria-hidden="true">{house.icon}</span>
                  <div><h3>{house.name}</h3><p>{members.length} {members.length === 1 ? "gracz" : "graczy"}</p></div>
                </div>
                <div className="member-list">
                  {members.length ? members.map((member) => (
                    <div className={`member-row ${member.id === player.id ? "is-you" : ""}`} key={member.id}>
                      <span className="member-avatar">{member.nickname.slice(0, 1).toUpperCase()}</span>
                      <span>{member.nickname}{member.id === player.id ? <small>TY</small> : null}</span>
                      <strong>{formatChips(member.tokens)}</strong>
                    </div>
                  )) : <p className="empty-house">Oczekiwanie na gracza…</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
