"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { POLL_INTERVAL_MS, TEAMS } from "@/lib/constants";
import { getSolenizantQuestion, SOLENIZANT_QUESTION_COUNT, SOLENIZANT_TITLE } from "@/lib/solenizant";
import type { GameSnapshot, TeamId } from "@/lib/types";

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
      if (response.status === 401) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (!response.ok) throw new Error("Nie udało się pobrać stanu gry.");
      const nextSnapshot = (await response.json()) as GameSnapshot;
      setSnapshot(nextSnapshot);
      setSyncError(false);
      if (nextSnapshot.game.activeSegment !== "solenizant") {
        router.refresh();
        return;
      }
      if (nextSnapshot.game.status === "waiting") {
        router.replace(viewerRole === "admin" ? "/admin" : "/lobby");
        router.refresh();
      }
    } catch {
      setSyncError(true);
    }
  }, [router, viewerRole]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function leave() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const { solenizantStage, currentQuestionIndex } = snapshot.game;
  const question = getSolenizantQuestion(currentQuestionIndex);
  const questionIsVisible = solenizantStage === "question" || solenizantStage === "scoring";
  const pointsFor = (teamId: TeamId) => snapshot.teamScores.find((score) => score.teamId === teamId)?.points ?? 0;

  return (
    <main className="app-shell game-shell">
      <header className="topbar">
        <CasinoLogo />
        <div className="topbar-actions">
          <span className="sync-indicator"><i /> {syncError ? "Ponowne łączenie…" : "Segment na żywo"}</span>
          {viewerRole === "admin" ? <button className="quiet-button" onClick={() => router.push("/admin")}>Panel prowadzącego</button> : null}
          <button className="quiet-button" onClick={leave}>Wyjdź</button>
        </div>
      </header>

      <section className="game-stage segment-stage">
        <div className="game-stage-glow" />
        <div className="game-stage-content">
          {solenizantStage === "intro" ? (
            <>
              <span className="eyebrow">Pierwszy segment</span>
              <h1>{SOLENIZANT_TITLE}</h1>
              <p>Za chwilę rozpocznie się pierwszy segment gry. Odpowiedzi podajecie poza aplikacją, a prowadzący przyzna punkty drużynom.</p>
              <div className="segment-rules">
                <span><strong>Grają:</strong> wszyscy</span>
                <span><strong>Zakłady:</strong> wyłączone</span>
                <span><strong>Punktacja:</strong> punkty za poprawne odpowiedzi</span>
              </div>
            </>
          ) : null}

          {questionIsVisible && question ? (
            <>
              <span className="eyebrow">{SOLENIZANT_TITLE} · pytanie {currentQuestionIndex + 1}/{SOLENIZANT_QUESTION_COUNT}</span>
              <h1 className="segment-question">{question}</h1>
              <p>Grają wszyscy. Zakłady są wyłączone. Odpowiedzi podajcie prowadzącemu poza aplikacją.</p>
            </>
          ) : null}

          {solenizantStage === "results" ? (
            <>
              <span className="eyebrow">{SOLENIZANT_TITLE} · zakończono</span>
              <h1>Wyniki <em>segmentu.</em></h1>
              <p>Wszystkie pytania zostały rozliczone. Poniżej znajduje się końcowa punktacja drużyn.</p>
            </>
          ) : null}
        </div>
      </section>

      <section className="score-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{solenizantStage === "results" ? "Wynik końcowy" : "Aktualna punktacja"}</span>
            <h2>Punkty drużyn</h2>
          </div>
          <span className="poll-note">Odświeżanie co 4 sekundy</span>
        </div>
        <div className="score-grid">
          {TEAMS.map((team) => (
            <article className="score-card" key={team.id} style={{ "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties}>
              <span className="score-symbol">{team.icon}</span>
              <h3>{team.name}</h3>
              <strong>{pointsFor(team.id)}</strong>
              <span className="score-caption">punkty</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
