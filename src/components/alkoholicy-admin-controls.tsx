"use client";

import { useState } from "react";

import { AlkoholicyBoard, TeamName } from "@/components/alkoholicy-screen";
import styles from "@/components/alkoholicy.module.css";
import { TEAMS, getTeam } from "@/lib/constants";
import type { GameSnapshot, TeamId } from "@/lib/types";
import type { AlkoholicyAction } from "@/lib/validation";

type Command = AlkoholicyAction["command"];

function TeamSelection({ labels, initial, onSave }: {
  labels: string[];
  initial: TeamId[];
  onSave: (teams: TeamId[]) => void;
}) {
  const [selection, setSelection] = useState<(TeamId | "")[]>(() => labels.map((_, index) => initial[index] ?? ""));
  const chosen = selection.filter((team): team is TeamId => Boolean(team));
  const valid = chosen.length === labels.length && new Set(chosen).size === labels.length;

  return (
    <form className={styles.form} onSubmit={(event) => { event.preventDefault(); if (valid) onSave(chosen); }}>
      <div className={styles.formGrid}>
        {labels.map((label, index) => (
          <label className="field-label" key={label}>{label}
            <select className="text-input" value={selection[index]} onChange={(event) => {
              const value = event.target.value as TeamId | "";
              setSelection((teams) => teams.map((team, slot) => slot === index ? value : team));
            }}>
              <option value="">Wybierz drużynę</option>
              {TEAMS.map((team) => <option key={team.id} value={team.id} disabled={selection.some((id, slot) => id === team.id && slot !== index)}>{team.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button className="gold-button" type="submit" disabled={!valid}>{labels.length === 4 ? "Zapisz kolejność" : "Zapisz drużyny"}</button>
    </form>
  );
}

const scores = ["0 punktów", "1 punkt", "2 punkty", "3 punkty", "4 punkty", "5 punktów", "6 punktów"];

function CharadesScoreForm({ team, savedPoints, send }: { team: TeamId; savedPoints?: number; send: (command: Command) => void }) {
  const [points, setPoints] = useState(savedPoints ?? 0);
  const correcting = savedPoints !== undefined;
  return (
    <form className={styles.scoreForm} onSubmit={(event) => {
      event.preventDefault();
      send({ action: correcting ? "correct-charades" : "score-charades", teamId: team, points });
    }}>
      <label className="field-label">Punkty drużyny {getTeam(team).name}
        <select className="text-input" value={points} onChange={(event) => setPoints(Number(event.target.value))}>
          {scores.map((label, index) => <option key={label} value={index}>{label}</option>)}
        </select>
      </label>
      <button className={correcting ? "secondary-button" : "gold-button"} type="submit" disabled={correcting && points === savedPoints}>{correcting ? "Zapisz korektę" : "Przyznaj punkty"}</button>
    </form>
  );
}

function DuelResultForm({ teams, send }: { teams: [TeamId, TeamId]; send: (command: Command) => void }) {
  const [winner, setWinner] = useState<TeamId | null>(null);
  return (
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault();
      if (winner) send({ action: "finish-duel", teamId: winner });
    }}>
      <div className={styles.actions} role="group" aria-label="Zwycięzca pojedynku">
        {teams.map((team) => <button key={team} type="button" className="secondary-button" aria-pressed={winner === team} onClick={() => setWinner(team)}><TeamName id={team} /></button>)}
      </div>
      <button className="gold-button" type="submit" disabled={!winner}>Zatwierdź zwycięzcę</button>
    </form>
  );
}

export function AlkoholicyAdminControls({ snapshot, disabled, error, send }: {
  snapshot: GameSnapshot;
  disabled: boolean;
  error: string;
  send: (command: Command) => void;
}) {
  const { stage, order, performance, scores: savedScores, duelTeams, duelIndex, charadesMarket, duelMarket } = snapshot.alkoholicy;
  const current = order[performance];
  const hasCorrections = order.some((team) => savedScores[team] !== undefined);
  const action = (command: Command, label: string) => <button className="gold-button" type="button" onClick={() => send(command)}>{label}</button>;

  return (
    <section className={styles.wrapper} aria-label="Sterowanie segmentem Alkoholicy">
      <AlkoholicyBoard snapshot={snapshot} />
      <fieldset className={styles.controls} disabled={disabled}>
        <legend>Panel prowadzącego</legend>
        {stage === "intro" && action({ action: "start" }, "Rozpocznij segment")}
        {(stage === "order" || stage === "charades-ready") && (
          <TeamSelection key={order.join(",")} labels={["Występ 1", "Występ 2", "Występ 3", "Występ 4"]} initial={order}
            onSave={([first, second, third, fourth]) => send({ action: "order", teams: [first, second, third, fourth] })} />
        )}
        {stage === "charades-ready" && <div className={styles.actions}>{action({ action: "open-charades" }, "Otwórz zakłady")}{action({ action: "start-charades" }, "Rozpocznij Kalambury bez zakładów")}</div>}
        {stage === "charades-betting" && (
          <><p>Przyjęte zakłady: {charadesMarket.counts.pending}</p>{action({ action: "start-charades" }, "Zamknij zakłady i rozpocznij Kalambury")}</>
        )}
        {stage === "charades-play" && (savedScores[current] === undefined ? (
          <CharadesScoreForm key={current} team={current} send={send} />
        ) : action({ action: "next-team" }, performance === 3 ? "Pokaż wyniki Kalamburów" : "Następna drużyna"))}
        {(stage === "charades-play" || stage === "charades-review") && hasCorrections && (
          <details className={styles.corrections}>
            <summary>Skoryguj zapisane punkty</summary>
            {order.map((team) => savedScores[team] !== undefined && <CharadesScoreForm key={`${team}-${savedScores[team]}`} team={team} savedPoints={savedScores[team]} send={send} />)}
          </details>
        )}
        {stage === "charades-review" && action({ action: "settle-charades" }, "Zatwierdź wyniki i rozlicz zakłady")}
        {stage === "charades-results" && action({ action: "next-game" }, "Przejdź do gry nr 2")}
        {stage === "duel-setup" && (
          <TeamSelection key={duelIndex + ":" + (duelTeams?.join(",") ?? "")} labels={["Pierwsza drużyna", "Druga drużyna"]} initial={duelTeams ?? []}
            onSave={([first, second]) => send({ action: "duel-teams", teams: [first, second] })} />
        )}
        {stage === "duel-setup" && duelTeams && <div className={styles.actions}>{action({ action: "open-duel" }, "Otwórz zakłady")}{action({ action: "start-duel" }, "Rozpocznij pojedynek bez zakładów")}</div>}
        {stage === "duel-betting" && <><p>Przyjęte zakłady: {duelMarket.counts.pending}. Rozpoczęcie pojedynku zamknie zakłady.</p>{action({ action: "start-duel" }, "Rozpocznij pojedynek")}</>}
        {stage === "duel-live" && duelTeams && <DuelResultForm key={duelIndex} teams={duelTeams} send={send} />}
        {stage === "duel-result" && action({ action: "next-duel" }, "Przejdź do pojedynku nr 2")}
        {stage === "results" && action({ action: "complete" }, "Zakończ segment")}
        {stage === "completed" && <p>Wyniki segmentu zostały zapisane.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </fieldset>
    </section>
  );
}
