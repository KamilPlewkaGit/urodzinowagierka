"use client";

import { useRef, useState } from "react";

import styles from "@/components/familiada.module.css";
import { formatPolishChips } from "@/lib/chips";
import { getTeam } from "@/lib/constants";
import type { FamiliadaSnapshot, FamiliadaStage, GameSnapshot } from "@/lib/types";
import type { FamiliadaAction } from "@/lib/validation";

export const familiadaPhaseLabel: Record<FamiliadaStage, string> = {
  setup: "Wybór drużyn",
  "match-ready": "Przygotowanie meczu",
  betting: "Zakłady otwarte",
  "betting-closed": "Zakłady zamknięte",
  "question-ready": "Wybór przedstawicieli",
  question: "Oczekiwanie na aktywację przycisków",
  buzzer: "Przyciski aktywne",
  first: "Pierwsza odpowiedź",
  second: "Druga odpowiedź",
  "no-answer": "Obie odpowiedzi błędne",
  play: "Odpowiada drużyna",
  steal: "Szansa na przejęcie",
  "round-result": "Wynik rundy",
  "match-confirmation": "Oczekiwanie na potwierdzenie wyniku meczu",
  "match-result": "Wynik meczu",
  completed: "Segment zakończony",
};

export function useFamiliadaAction(revision: string, refresh: () => Promise<void>) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function send(command: FamiliadaAction["command"]) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/segment/familiada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, command }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Nie udało się zapisać akcji Familiady.");
      }
      await refresh();
    } catch {
      setError("Połączenie z Familiadą jest chwilowo niedostępne.");
      await refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return { send, pending, error };
}

export function FamiliadaBoard({ round, questionIndex }: {
  round: NonNullable<FamiliadaSnapshot["round"]>;
  questionIndex: number;
}) {
  return (
    <div className={styles.board}>
      <div className={styles.question}>
        <p>Pytanie {questionIndex + 1} z 4</p>
        <h2>{round.question}</h2>
      </div>
      <ol className={styles.answers} key={questionIndex}>
        {round.answers.map(({ position, revealed }) => (
          <li key={position} className={revealed ? styles.revealed : styles.hidden}>
            <span>{position}</span>
            <span aria-label={revealed ? undefined : "Ukryta odpowiedź"}>{revealed?.text ?? "••••••••••"}</span>
            <strong aria-hidden={revealed ? undefined : true}>{revealed?.points ?? "–"}</strong>
          </li>
        ))}
      </ol>
      <div className={styles.boardFooter}>
        <div className={styles.pool}>Pula rundy <strong>{round.pool} pkt</strong></div>
        <div className={styles.strikeCounter} role="status">
          <span>Wspólne błędy: {round.strikes} z 3</span>
          <div className={styles.strikes} aria-hidden="true">
            {[1, 2, 3].map((number) => (
              <span key={`${number}-${number <= round.strikes}`} className={number <= round.strikes ? styles.struck : undefined}>×</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function FamiliadaScores({ match }: { match: FamiliadaSnapshot["matches"][number] }) {
  return (
    <div className={styles.scores} aria-label="Punkty w meczu">
      {match.teams.map((id, index) => {
        const team = getTeam(id);
        return (
          <div key={id} className={styles.score}>
            <span style={{ color: team.color }}><span aria-hidden="true">{team.icon} </span>{team.name}</span>
            <strong>{match.scores[index]} pkt</strong>
          </div>
        );
      })}
    </div>
  );
}

export function FamiliadaRoundStatus({ state }: { state: FamiliadaSnapshot }) {
  const { round, stage } = state;
  if (!round) return null;
  const first = round.representatives.find((player) => player.id === round.buzzerWinner);
  const second = round.representatives.find((player) => player.id !== round.buzzerWinner);
  const stealingTeam = state.matches[state.matchIndex].teams.find((id) => id !== round.controllingTeam);

  return (
    <div className={styles.roundStatus} aria-live="polite">
      <ul aria-label="Przedstawiciele">
        {round.representatives.map((player) => (
          <li key={player.id}><strong>{player.nickname}</strong> · {getTeam(player.teamId).name}</li>
        ))}
      </ul>
      {first && <p>Pierwszeństwo: <strong>{first.nickname}</strong></p>}
      {stage === "second" && second && <p>Teraz odpowiada <strong>{second.nickname}</strong>.</p>}
      {stage === "play" && round.controllingTeam && <p>Odpowiada <strong>{getTeam(round.controllingTeam).name}</strong>.</p>}
      {stage === "steal" && stealingTeam && <p><strong>{getTeam(stealingTeam).name}</strong> ma jedną próbę przejęcia puli.</p>}
      {stage === "round-result" && round.winner && (
        <p className={styles.announcement}>{round.stealFailed && "Nieudane przejęcie. "}<strong>{getTeam(round.winner).name}</strong> wygrywa rundę i zdobywa {round.pool} pkt.</p>
      )}
    </div>
  );
}

export function FamiliadaScreen({ snapshot, refresh, viewerPlayerId }: {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerPlayerId?: number;
}) {
  const state = snapshot.familiada;
  const { stage, matchIndex, matches, round } = state;
  const match = matches[matchIndex];
  const viewer = snapshot.players.find((player) => player.id === viewerPlayerId);
  const canBuzz = stage === "buzzer" && round?.representatives.some((player) => player.id === viewerPlayerId);
  const showBoard = round && stage !== "question-ready" && stage !== "betting-closed";
  const { send, pending, error } = useFamiliadaAction(state.revision, refresh);

  return (
    <section className={showBoard ? `${styles.stage} ${styles.liveStage}` : styles.stage} aria-labelledby="familiada-heading">
      <header className={styles.title}>
        <span>Segment VIII{stage !== "setup" && stage !== "completed" && ` · Mecz ${matchIndex + 1} z 2`}</span>
        <h1 id="familiada-heading">Familiada</h1>
        <p>{familiadaPhaseLabel[stage]}</p>
      </header>
      {stage === "setup" && <p className={styles.message}>Dwa mecze po cztery pytania. Prowadzący ustala skład obu meczów.</p>}
      {match && stage !== "setup" && stage !== "match-result" && stage !== "completed" && <FamiliadaScores match={match} />}
      {canBuzz && <button type="button" className={styles.buzzer} disabled={pending} onClick={() => void send({ action: "buzz" })}>ODPOWIADAM!</button>}
      {showBoard && (
        <>
          <FamiliadaBoard round={round} questionIndex={state.questionIndex} />
          <FamiliadaRoundStatus state={state} />
        </>
      )}
      {stage === "betting" && viewer && match && (
        <div className={styles.message}>
          {match.teams.includes(viewer.teamId) ? <p>Twoja drużyna gra w tym meczu.</p> :
            match.viewerBet ? <p>Twój zakład na <strong>{getTeam(match.viewerBet.target).name}</strong> został przyjęty.</p> : (
              <>
                <p>Możesz obstawić zwycięzcę meczu za 2 żetony.</p>
                <div className={styles.actions}>
                  {match.teams.map((teamId) => (
                    <button key={teamId} type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: "bet", teamId })}>
                      Stawiam na {getTeam(teamId).name}
                    </button>
                  ))}
                </div>
              </>
            )}
        </div>
      )}
      {matches.some((item) => item.winner) && (
        <div className={styles.results} aria-live="polite">
          {matches.map((item, index) => item.winner && (
            <article key={index}>
              <h2>Mecz {index + 1} wygrywa {getTeam(item.winner).name}</h2>
              <FamiliadaScores match={item} />
              {item.viewerBet?.result === "won" && <p>Twój zakład wygrywa. Wypłata: {formatPolishChips(item.viewerBet.payout)} żetony.</p>}
              {item.viewerBet?.result === "lost" && <p>Twój zakład przegrywa. Strata: 2 żetony.</p>}
            </article>
          ))}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
