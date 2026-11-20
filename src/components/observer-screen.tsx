"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { useFloorPreload } from "@/components/floor-preload";
import { ActiveSegment, useGameSession } from "@/components/game-session";
import { GOLD_TITLE } from "@/components/gold-challenge-screen";
import { getSegmentNumber, TEAMS } from "@/lib/constants";
import { THE_FLOOR_TITLE } from "@/lib/floor";
import { MELODIA_TITLE } from "@/lib/melodia";
import { POJEDYNKI_TITLE } from "@/lib/pojedynki";
import { SOLENIZANT_TITLE } from "@/lib/solenizant";
import { SPORT_TITLE } from "@/lib/sport";
import type { GameSnapshot, SegmentId } from "@/lib/types";
import styles from "@/components/observer.module.css";

const segmentNames: Record<SegmentId, string> = {
  solenizant: SOLENIZANT_TITLE,
  "the-floor": THE_FLOOR_TITLE,
  sport: SPORT_TITLE,
  melodia: MELODIA_TITLE,
  pojedynki: POJEDYNKI_TITLE,
  familiada: "Familiada",
  "gold-challenge": GOLD_TITLE,
  alkoholicy: "ALKOHOLICY",
  finale: "Finał",
};

function confirmedWinner(snapshot: GameSnapshot) {
  const { game, theFloor, sport, melodia, pojedynki, familiada, goldChallenge, alkoholicy, finale } = snapshot;
  switch (game.activeSegment) {
    case "the-floor":
      return theFloor.stage === "result" && theFloor.currentDuel?.settledAt ? theFloor.currentDuel.winnerTeamId : null;
    case "sport":
      if (sport.stage === "result") return sport.currentChallenge?.winnerTeamId;
      if (sport.stage === "bonus-result") return sport.currentBonus?.winnerTeamId;
      return null;
    case "melodia":
      return melodia.stage === "result" ? melodia.currentSong?.winningTeamId : melodia.winningTeamId;
    case "pojedynki":
      return pojedynki.stage === "result" ? pojedynki.currentDuel?.winnerTeamId : null;
    case "familiada":
      if (familiada.stage === "round-result") return familiada.round?.winner;
      if (familiada.stage === "match-result") return familiada.matches[familiada.matchIndex]?.winner;
      return null;
    case "gold-challenge":
      return goldChallenge.stage === "result" ? goldChallenge.firstScoreTeam ?? goldChallenge.winner?.teamId : null;
    case "alkoholicy":
      if (alkoholicy.stage === "charades-results" && alkoholicy.charadesLeaders.length === 1) return alkoholicy.charadesLeaders[0];
      if (["duel-result", "results", "completed"].includes(alkoholicy.stage)) return alkoholicy.duelHistory[alkoholicy.duelIndex]?.winner;
      return null;
    case "finale":
      return finale.overallWinner ?? finale.question?.winner;
    default:
      return null;
  }
}

export function ObserverScreen({ initialSnapshot }: { initialSnapshot: GameSnapshot }) {
  const { snapshot, refresh, syncError, leave, leaving, logoutError } = useGameSession(initialSnapshot, undefined, { observerOnly: true });
  const shell = useRef<HTMLElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const { activeSegment, status } = snapshot.game;
  const started = status === "started";
  const winner = started ? confirmedWinner(snapshot) : null;
  const floorActive = started && activeSegment === "the-floor" && snapshot.theFloor.stage !== "results";
  useFloorPreload(floorActive, false, { readOnly: true });

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(document.fullscreenElement === shell.current);
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    setFullscreenError(false);
    try {
      if (document.fullscreenElement === shell.current) await document.exitFullscreen();
      else await shell.current?.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  }

  return (
    <main ref={shell} className={styles.shell} data-observer-view data-segment={started ? activeSegment : "oczekiwanie"}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">♠</span>
          <div><p>Widok obserwatora</p><strong>Wielki Stół</strong></div>
        </div>
        <p className={styles.segment}>
          {started ? <><span>{getSegmentNumber(activeSegment)}</span><strong>{segmentNames[activeSegment]}</strong></> : <strong>Oczekiwanie na start</strong>}
        </p>
        <div className={styles.actions}>
          <button className={styles.fullscreen} type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>
            {fullscreen ? "Zakończ pełny ekran" : "Pełny ekran"}
          </button>
          <button className={styles.logout} type="button" onClick={leave} disabled={leaving}>Wyloguj się</button>
        </div>
      </header>
      {(syncError || logoutError || fullscreenError) && <p className={styles.notice} role="status">
        {syncError ? "Przerwa w połączeniu. Ponawiamy synchronizację…" : logoutError ? "Nie udało się wylogować. Spróbuj ponownie." : "Nie udało się włączyć lub wyłączyć pełnego ekranu."}
      </p>}
      <section className={styles.scoreboard} aria-label="Klasyfikacja drużyn">
        <h2>Punktacja drużyn</h2>
        <ul>
          {TEAMS.map((team) => {
            const points = snapshot.teamScores.find(({ teamId }) => teamId === team.id)?.points ?? 0;
            return <li key={team.id} data-winner={winner === team.id}
              style={{ "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties}>
              <span className={styles.teamName}><span aria-hidden="true">{team.icon}</span> {team.name}</span>
              <strong key={points} className={styles.points}>{points}<span className="sr-only"> pkt</span></strong>
            </li>;
          })}
        </ul>
      </section>
      <div className={styles.presentation} key={started ? activeSegment : "oczekiwanie"}>
        {started ? <ActiveSegment snapshot={snapshot} refresh={refresh} viewerRole="observer" /> : (
          <section className={styles.waiting} aria-labelledby="observer-waiting">
            <span aria-hidden="true">♠</span>
            <h1 id="observer-waiting">Gra rozpocznie się wkrótce</h1>
            <p>Plansza pojawi się, gdy prowadzący rozpocznie grę.</p>
          </section>
        )}
      </div>
    </main>
  );
}
