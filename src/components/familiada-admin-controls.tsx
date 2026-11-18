"use client";

import { useState } from "react";

import { FamiliadaBoard, FamiliadaRoundStatus, FamiliadaScores, familiadaPhaseLabel, useFamiliadaAction } from "@/components/familiada-screen";
import styles from "@/components/familiada.module.css";
import { TEAMS, getTeam } from "@/lib/constants";
import type { GameSnapshot, TeamId } from "@/lib/types";
import type { FamiliadaAction } from "@/lib/validation";

type Submit = (command: FamiliadaAction["command"]) => Promise<void>;
type Matchups = [TeamId, TeamId, TeamId, TeamId];
type TeamChoice = TeamId | "";
type DraftMatchups = [TeamChoice, TeamChoice, TeamChoice, TeamChoice];

function MatchSetup({ savedTeams, pending, send }: { savedTeams: Matchups | null; pending: boolean; send: Submit }) {
  const [teams, setTeams] = useState<DraftMatchups>(savedTeams ?? ["", "", "", ""]);
  const saved = savedTeams?.every((team, index) => team === teams[index]);
  const ready = teams.every(Boolean) && new Set(teams).size === 4;

  return (
    <>
      <ul className={styles.teamList} aria-label="Dostępne drużyny">
        {TEAMS.map((team) => <li key={team.id} style={{ color: team.color }}>{team.icon} {team.name}</li>)}
      </ul>
      <div className={styles.formGrid}>
        {[0, 1].map((matchIndex) => (
          <fieldset key={matchIndex} className={styles.fieldset} disabled={pending}>
            <legend>Mecz {matchIndex + 1}</legend>
            {[0, 1].map((side) => {
              const index = matchIndex * 2 + side;
              return (
                <label key={side}>
                  {side === 0 ? "Pierwsza drużyna" : "Druga drużyna"}
                  <select value={teams[index]} onChange={(event) => {
                    const team = event.target.value as TeamId | "";
                    const next: DraftMatchups = [...teams];
                    next[index] = team;
                    setTeams(next);
                  }}>
                    <option value="">Wybierz drużynę</option>
                    {TEAMS.map((team) => (
                      <option key={team.id} value={team.id} disabled={teams.some((id, slot) => slot !== index && id === team.id)}>{team.name}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      {!saved && <p>Wybierz cztery drużyny i zatwierdź skład obu meczów, aby rozpocząć Familiadę.</p>}
      <div className={styles.actions}>
        <button type="button" className="quiet-button" disabled={pending || !ready || saved} onClick={() => void send({ action: "configure", teams: teams as Matchups })}>Zatwierdź drużyny</button>
        <button type="button" className="gold-button" disabled={pending || !saved} onClick={() => void send({ action: "start" })}>Rozpocznij segment</button>
      </div>
    </>
  );
}

function RepresentativePicker({ snapshot, pending, send }: { snapshot: GameSnapshot; pending: boolean; send: Submit }) {
  const { matches, matchIndex, stage, round } = snapshot.familiada;
  const [first, setFirst] = useState(round?.representatives[0]?.id ?? 0);
  const [second, setSecond] = useState(round?.representatives[1]?.id ?? 0);
  const ids = [first, second] as const;
  const setters = [setFirst, setSecond];
  const teams = matches[matchIndex].teams;
  const available = teams.map((id) => snapshot.players.filter((player) => player.teamId === id));
  const valid = available.every((players, index) => players.some((player) => player.id === ids[index]));
  const replacing = stage === "question";
  const changed = ids.some((id, index) => id !== round?.representatives[index]?.id);

  return (
    <fieldset className={styles.fieldset} disabled={pending}>
      <legend>Przedstawiciele</legend>
      <div className={styles.formGrid}>
        {teams.map((team, index) => (
          <label key={team}>
            {getTeam(team).name}
            <select value={available[index].some((player) => player.id === ids[index]) ? ids[index] : 0} onChange={(event) => setters[index](Number(event.target.value))}>
              <option value={0}>{available[index].length ? "Wybierz gracza" : "Brak aktywnych graczy"}</option>
              {available[index].map((player) => <option key={player.id} value={player.id}>{player.nickname}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button type="button" className={replacing ? "quiet-button" : "gold-button"} disabled={!valid || (replacing && !changed)} onClick={() => void send({
        action: replacing ? "replace-representatives" : "start-question",
        players: [first, second],
      })}>
        {replacing ? "Zapisz przedstawicieli" : "Rozpocznij pytanie"}
      </button>
    </fieldset>
  );
}

export function FamiliadaAdminControls({ snapshot, onRefresh }: { snapshot: GameSnapshot; onRefresh: () => Promise<void> }) {
  const state = snapshot.familiada;
  const { stage, matches, matchIndex, questionIndex, round } = state;
  const match = matches[matchIndex];
  const { send, pending, error } = useFamiliadaAction(state.revision, onRefresh);
  const savedTeams: Matchups | null = matches.length === 2 ? [...matches[0].teams, ...matches[1].teams] : null;
  const predicts = stage === "match-ready" || stage === "betting";
  const selecting = stage === "betting-closed" || stage === "question-ready" || stage === "question";
  const opening = stage === "question" || stage === "buzzer" || stage === "first";
  const evaluating = stage === "first" || stage === "second" || stage === "play" || stage === "steal";
  const answerAction = evaluating || stage === "round-result";
  const leaders = match?.teams.filter((_, index) => match.scores[index] >= match.scores[1 - index]) ?? [];
  const representativesActive = round?.representatives.every((rep) => snapshot.players.some((player) => player.id === rep.id));

  function closeBetting() {
    if (stage === "betting" && !window.confirm("Zamknąć zakłady i przejść do wyboru przedstawicieli?")) return;
    void send({ action: "close-betting" });
  }

  return (
    <section className={styles.stage} aria-labelledby="familiada-admin-heading">
      <header className={styles.title}>
        <span>Segment VIII{stage !== "setup" && stage !== "completed" && ` · Mecz ${matchIndex + 1} z 2`}</span>
        <h2 id="familiada-admin-heading">Familiada</h2>
        <p>{familiadaPhaseLabel[stage]}</p>
      </header>
      {stage === "setup" && <MatchSetup key={savedTeams?.join(",") ?? "setup"} savedTeams={savedTeams} pending={pending} send={send} />}
      {match && stage !== "setup" && stage !== "completed" && <FamiliadaScores match={match} />}
      {predicts && (
        <div className={styles.message}>
          {stage === "match-ready" && <p>Mecz jest gotowy. Otwórz lub pomiń zakłady, aby przejść do wyboru przedstawicieli i uruchomić pierwsze pytanie.</p>}
          {stage === "betting" && <p>Przyjęte zakłady: <strong>{match.betCount}</strong></p>}
          <div className={styles.actions}>
            {stage === "match-ready" && <button type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: "open-betting" })}>Otwórz zakłady</button>}
            <button type="button" className="quiet-button" disabled={pending} onClick={closeBetting}>{stage === "betting" ? "Zamknij zakłady" : "Pomiń zakłady"}</button>
          </div>
        </div>
      )}
      {round && (
        <>
          <FamiliadaBoard round={round} questionIndex={questionIndex} />
          <FamiliadaRoundStatus state={state} />
        </>
      )}
      {selecting && <RepresentativePicker key={`${matchIndex}-${questionIndex}-${round?.representatives.map((player) => player.id).join(",")}`} snapshot={snapshot} send={send} pending={pending} />}
      {opening && (
        <div className={styles.actions}>
          {stage === "question" && <button type="button" className="gold-button" disabled={pending || !representativesActive} onClick={() => void send({ action: "activate" })}>Aktywuj przyciski</button>}
          {stage !== "question" && <button type="button" className="quiet-button" disabled={pending} onClick={() => void send({ action: "reset-buzzer" })}>Zresetuj przyciski</button>}
          {round?.representatives.map((player) => (
            <button key={player.id} type="button" className="quiet-button" disabled={pending || player.id === round.buzzerWinner || !snapshot.players.some((active) => active.id === player.id)} onClick={() => void send({ action: "respondent", playerId: player.id })}>
              Pierwszeństwo dla {player.nickname}
            </button>
          ))}
        </div>
      )}
      {stage === "no-answer" && (
        <div className={styles.actions}>
          <button type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: "reset-buzzer" })}>Ponów konfrontację</button>
          {match.teams.map((teamId) => <button key={teamId} type="button" className="quiet-button" disabled={pending} onClick={() => void send({ action: "control", teamId })}>Prowadzenie: {getTeam(teamId).name}</button>)}
        </div>
      )}
      {round?.adminAnswers && (
        <fieldset className={styles.fieldset} disabled={pending}>
          <legend>{stage === "round-result" ? "Odsłanianie po rundzie · bez punktów" : "Klucz odpowiedzi"}</legend>
          <ol className={styles.adminAnswers}>
            {round.adminAnswers.map((answer) => {
              const revealed = Boolean(round.answers[answer.position - 1].revealed);
              return (
                <li key={answer.position}>
                  <span><strong>{answer.position}.</strong> {answer.text} · <strong>{answer.points} pkt</strong></span>
                  {revealed ? <small>Odsłonięta</small> : answerAction && (
                    <button type="button" className="quiet-button" aria-label={`Odsłoń: ${answer.text}`} onClick={() => void send({ action: "answer", position: answer.position })}>Odsłoń</button>
                  )}
                </li>
              );
            })}
          </ol>
          {evaluating && <button type="button" className={styles.errorButton} onClick={() => void send({ action: "mistake" })}>BŁĄD – X</button>}
        </fieldset>
      )}
      {stage === "round-result" && (
        <button type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: "next" })}>{questionIndex < 3 ? "Następne pytanie" : "Przejdź do podsumowania meczu"}</button>
      )}
      {stage === "match-confirmation" && (
        <div className={styles.message}>
          <p>{leaders.length > 1 ? "Remis. Wybierz zwycięską drużynę i rozlicz zakłady." : "Potwierdź wynik meczu i rozlicz zakłady."}</p>
          <div className={styles.actions}>
            {leaders.map((teamId) => <button key={teamId} type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: "confirm-match", teamId })}>Zatwierdź: {getTeam(teamId).name}</button>)}
          </div>
        </div>
      )}
      {(stage === "match-result" || stage === "completed") && (
        <div className={styles.message}>
          {matches.map((item, index) => item.winner && <p key={index}>Mecz {index + 1}: <strong>{getTeam(item.winner).name}</strong> · {item.scores.join(" : ")}</p>)}
          {stage === "match-result" && <button type="button" className="gold-button" disabled={pending} onClick={() => void send({ action: matchIndex === 0 ? "next" : "complete" })}>{matchIndex === 0 ? "Przygotuj drugi mecz" : "Zakończ segment"}</button>}
        </div>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
