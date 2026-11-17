"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { POLL_INTERVAL_MS, TEAMS } from "@/lib/constants";
import type { GameSnapshot } from "@/lib/types";

interface AdminDashboardProps {
  initialSnapshot: GameSnapshot;
}

export function AdminDashboard({ initialSnapshot }: AdminDashboardProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (!response.ok) throw new Error("State request failed");
      setSnapshot((await response.json()) as GameSnapshot);
    } catch {
      // Polling will recover on its next interval; the last known state is still useful.
    }
  }, []);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function start() {
    setError("");
    setIsStarting(true);
    try {
      const response = await fetch("/api/game/start", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as GameSnapshot | { error?: string } | null;
      if (!response.ok) {
        setError(payload && "error" in payload ? payload.error ?? "Unable to start the game." : "Unable to start the game.");
        return;
      }
      await refresh();
    } catch {
      setError("Unable to reach the game service.");
    } finally {
      setIsStarting(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const isStarted = snapshot.game.status === "started";
  return (
    <main className="app-shell admin-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="admin-badge">Administrator</span>
          <button className="quiet-button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="admin-intro">
        <div>
          <span className="eyebrow">Game control</span>
          <h1>The command <em>table</em>.</h1>
          <p>Review the lobby and open the game when every player is seated.</p>
        </div>
        <div className={`game-status ${isStarted ? "is-live" : ""}`}>
          <span className="status-light" />
          <span>{isStarted ? "Game is live" : "Lobby is waiting"}</span>
        </div>
      </section>

      <section className="admin-control-grid">
        <article className="start-panel">
          <span className="panel-index">01 / GAME CONTROL</span>
          <h2>{isStarted ? "The table is open." : "Ready to deal?"}</h2>
          <p>{isStarted ? "All connected players have been sent to the active-game screen." : "Starting is permanent for this game session and immediately updates all waiting players."}</p>
          <button className="gold-button start-button" onClick={start} disabled={isStarting || isStarted}>
            <span>{isStarting ? "Opening table…" : isStarted ? "Game started" : "Start game"}</span>
            <span aria-hidden="true">{isStarted ? "✓" : "→"}</span>
          </button>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </article>
        <article className="admin-stat-panel">
          <span className="panel-index">02 / LOBBY PULSE</span>
          <div className="admin-stat"><strong>{snapshot.players.length}</strong><span>registered players</span></div>
          <div className="admin-stat"><strong>{snapshot.players.reduce((total, player) => total + player.tokens, 0)}</strong><span>virtual chips in play</span></div>
        </article>
      </section>

      <section className="admin-roster">
        <div className="section-heading">
          <div><span className="eyebrow">Live roster</span><h2>Players by house</h2></div>
          <span className="poll-note">Updates every 4 seconds</span>
        </div>
        <div className="admin-team-list">
          {TEAMS.map((team) => {
            const members = snapshot.players.filter((player) => player.teamId === team.id);
            return (
              <article className="admin-team-row" key={team.id} style={{ "--team-color": team.color } as CSSProperties}>
                <span className="admin-team-icon">{team.icon}</span>
                <div><h3>{team.name}</h3><p>{team.tagline}</p></div>
                <strong>{members.length}</strong>
                <span>{members.length === 1 ? "player" : "players"}</span>
                <div className="admin-names">{members.length ? members.map((member) => <span key={member.id}>{member.nickname}</span>) : <em>Empty</em>}</div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
