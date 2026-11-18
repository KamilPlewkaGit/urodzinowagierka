"use client";

import { useState } from "react";

import { FinalePresentation, formatFinaleEstimate } from "@/components/finale-screen";
import styles from "@/components/finale.module.css";
import { getTeam } from "@/lib/constants";
import type { FinaleSnapshot, TeamId } from "@/lib/types";
import type { FinaleCommand } from "@/lib/validation";

type ControlsProps = {
  finale: FinaleSnapshot;
  disabled: boolean;
  send: (command: FinaleCommand) => void;
};

function SelectFinalists({ finale, send }: ControlsProps) {
  const [selectedFirst, setSelectedFirst] = useState<TeamId | "">("");
  const [selectedSecond, setSelectedSecond] = useState<TeamId | "">("");
  const firstOptions = [...new Set(finale.eligibleOrders.map(([team]) => team))];
  const first = firstOptions.length === 1 ? firstOptions[0] : selectedFirst;
  const secondOptions = finale.eligibleOrders.filter(([team]) => team === first).map(([, team]) => team);
  const second = secondOptions.length === 1 ? secondOptions[0] : selectedSecond;
  const canConfirm = first && second && secondOptions.includes(second);

  return (
    <>
      {finale.stage === "ready" && <p>Punktacja się zmieniła. Zatwierdź finalistów ponownie.</p>}
      {firstOptions.length > 1 && (
        <label className="field-label">Kto rozpocznie przy remisie?
          <select className="text-input" value={selectedFirst} onChange={(event) => {
            setSelectedFirst(event.target.value as TeamId | "");
            setSelectedSecond("");
          }}>
            <option value="">Wybierz drużynę</option>
            {firstOptions.map((teamId) => <option key={teamId} value={teamId}>{getTeam(teamId).name}</option>)}
          </select>
        </label>
      )}
      {secondOptions.length > 1 && (
        <label className="field-label">Druga drużyna przy remisie
          <select className="text-input" value={selectedSecond} onChange={(event) => setSelectedSecond(event.target.value as TeamId | "")}>
            <option value="">Wybierz drużynę</option>
            {secondOptions.map((teamId) => <option key={teamId} value={teamId}>{getTeam(teamId).name}</option>)}
          </select>
        </label>
      )}
      <button className="gold-button" type="button" disabled={!canConfirm} onClick={() => canConfirm && send({ action: "confirm-finalists", teams: [first, second] })}>
        Zatwierdź finalistów
      </button>
    </>
  );
}

function QuestionControls({ finale, send }: ControlsProps) {
  const [estimate, setEstimate] = useState("");
  const [winner, setWinner] = useState<TeamId | null>(null);
  const { question, finalists, stage } = finale;
  if (!question || !finalists) return null;

  if (stage === "question") {
    if (question.estimate === null) {
      return (
        <form className={styles.estimateForm} onSubmit={(event) => {
          event.preventDefault();
          if (estimate.trim()) send({ action: "estimate", value: estimate });
        }}>
          <label className="field-label" htmlFor="finale-estimate">Szacunek drużyny {getTeam(finalists[0].teamId).name}</label>
          <input id="finale-estimate" className="text-input" value={estimate} onChange={(event) => setEstimate(event.target.value)} inputMode={question.unit === "people" ? "numeric" : "decimal"} aria-describedby="finale-unit" maxLength={15} required autoComplete="off" />
          <p id="finale-unit">{question.unit === "percent" ? "Podaj procent od 0 do 100." : question.unit === "people" ? "Podaj pełną liczbę osób, bez skrótu „mln”." : "Podaj liczbę lat."}</p>
          <button className="gold-button" type="submit" disabled={!estimate.trim()}>Zatwierdź szacunek</button>
        </form>
      );
    }
    if (question.direction === null) {
      return (
        <>
          <p>Wybór drużyny {getTeam(finalists[1].teamId).name}</p>
          <div className={styles.actions}>
            <button className="gold-button" type="button" onClick={() => send({ action: "direction", value: "more" })}>WIĘCEJ</button>
            <button className="gold-button" type="button" onClick={() => send({ action: "direction", value: "less" })}>MNIEJ</button>
          </div>
        </>
      );
    }
    return <button className="gold-button" type="button" onClick={() => send({ action: "reveal" })}>Pokaż odpowiedź</button>;
  }
  if (stage === "answer") {
    return (
      <>
        <p>Wybierz zwycięzcę pytania.</p>
        {question.estimate !== null && <p>{getTeam(finalists[0].teamId).name} <strong>{formatFinaleEstimate(question.estimate, question.unit)}</strong> · {getTeam(finalists[1].teamId).name} <strong>{question.direction === "more" ? "WIĘCEJ" : "MNIEJ"}</strong></p>}
        <div className={styles.actions} role="group" aria-label="Zwycięzca pytania">
          {finalists.map(({ teamId }) => (
            <button className="secondary-button" type="button" aria-pressed={winner === teamId} key={teamId} onClick={() => setWinner(teamId)}>{getTeam(teamId).name}</button>
          ))}
        </div>
        <button className="gold-button" type="button" disabled={!winner} onClick={() => winner && send({ action: "confirm-winner", teamId: winner })}>Zatwierdź zwycięzcę</button>
      </>
    );
  }
  if (stage === "winner") return <button className="gold-button" type="button" onClick={() => send({ action: "show-wheel" })}>Pokaż koło fortuny</button>;
  if (stage === "wheel") {
    return <button className="gold-button" type="button" onClick={() => send({ action: "next" })}>{question.number === 4 ? "Przejdź do podsumowania" : "Następne pytanie"}</button>;
  }
  return null;
}

export function FinaleAdminControls({ error, ...props }: ControlsProps & { error: string }) {
  const { finale, disabled, send } = props;
  const { question, stage } = finale;

  return (
    <section className={styles.admin} aria-label="Sterowanie finałem">
      <FinalePresentation finale={finale} />
      <fieldset className={styles.controls} disabled={disabled}>
        <legend>Panel finału</legend>
        {question?.adminAnswer && <p>Klucz odpowiedzi <strong>{question.adminAnswer}</strong></p>}
        {(stage === "intro" || stage === "ready") && (finale.needsConfirmation ? (
          <SelectFinalists key={JSON.stringify(finale.eligibleOrders)} {...props} />
        ) : (
          <button className="gold-button" type="button" onClick={() => send({ action: "start" })}>Rozpocznij finał</button>
        ))}
        {question && <QuestionControls key={question.number} {...props} />}
        {stage === "summary" && <button className="gold-button" type="button" onClick={() => send({ action: "complete" })}>Zakończ grę</button>}
        {stage === "completed" && <p>Wyniki finału zostały zapisane.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </fieldset>
    </section>
  );
}
