"use client";

import { useState } from "react";
import { useSegmentCommand } from "@/components/segment-command";
import styles from "@/components/gold-challenge.module.css";
import { formatPolishChips } from "@/lib/chips";
import { getTeam } from "@/lib/constants";
import type { GameSnapshot, GoldReward, GoldSnapshot, GoldStage } from "@/lib/types";
import type { GoldAction } from "@/lib/validation";

export const GOLD_TITLE = "KTO GRA GRUBO, WYGRAĆ MUSI";

export const goldStageLabel: Record<GoldStage, string> = {
  intro: "Wprowadzenie",
  nominations: "Nominacje przedstawicieli",
  contributions: "Wpłaty do puli",
  live: "Wielkie wyzwanie trwa",
  result: "Zwycięzcy złotego wyzwania",
  "six-intro": "Szczęśliwa szóstka",
  "six-voting": "Głosowanie trwa",
  "six-closed": "Głosowanie zamknięte",
  "six-confirmed": "Wynik oczekuje na rozliczenie",
  "six-result": "Wyniki Szczęśliwej szóstki",
  completed: "Segment zakończony",
};

export function GoldRewardList({ reward }: { reward: GoldReward }) {
  return (
    <>
      <p className={styles.rewardTotal}><strong>{formatPolishChips(reward.pool)}</strong> żetonów w puli</p>
      {reward.contributors !== undefined && <p>Wpłaty po 10 żetonów od {reward.contributors} graczy.</p>}
      <ul className={styles.ledger} aria-label="Podział puli">
        {reward.shares.map(({ playerId, nickname, amount }) => <li key={playerId}><span>{nickname}</span><strong>+{formatPolishChips(amount)} żet.</strong></li>)}
      </ul>
    </>
  );
}

export function GoldBoard({ state }: { state: GoldSnapshot }) {
  const { stage, teams, representatives, reward, winner } = state;
  const six = stage.startsWith("six-") || stage === "completed";
  const celebrating = stage === "result" || stage === "six-result" || stage === "completed";
  return (
    <section className={`${styles.stage} ${celebrating ? styles.celebrating : ""}`} aria-label={GOLD_TITLE}>
      <div className={styles.dust} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className={styles.chip} aria-hidden="true">♦</div>
      <h1 className={styles.title}>{six ? "SZCZĘŚLIWA SZÓSTKA" : GOLD_TITLE}</h1>
      {stage !== "intro" && <h2 className={styles.subtitle}>{six ? "GRA 2 – SZCZĘŚLIWA SZÓSTKA" : "GRA 1 – NAJDZIELNIEJSZY ZAWODNIK"}</h2>}
      {stage === "intro" && (
        <>
          <p className={styles.intro}>Każda drużyna wybiera swojego najdzielniejszego zawodnika, który będzie ją reprezentował w wielkim wyzwaniu. Zwycięzca zdobywa ogromną pulę żetonów dla całej swojej drużyny!</p>
          <ul className={styles.rules}>
            <li>Każda uczestnicząca drużyna nominuje jednego przedstawiciela.</li>
            <li>Prowadzący wybiera zwycięzcę wyzwania. Jego drużyna otrzymuje 1 punkt.</li>
            <li>Każdy zawodnik uczestniczącej drużyny wpłaca 10 żetonów przed wyzwaniem.</li>
            <li>Cała pula jest dzielona między aktywnych członków zwycięskiej drużyny.</li>
            <li>W grze nr 2 każdy gracz może wybrać numer od 1 do 6 za 10 żetonów. Każdy trafiony głos daje 1 punkt jego drużynie.</li>
          </ul>
        </>
      )}
      {stage === "nominations" && <h2 className={styles.subtitle}>Nominacje przedstawicieli</h2>}
      {stage === "contributions" && <p>Prowadzący przygotowuje wspólną pulę. Wpłata wynosi 10 żetonów od gracza.</p>}
      {stage === "live" && <><div className={styles.versus}>KONTRA</div><p className={styles.subtitle}>Wielkie wyzwanie trwa!</p></>}
      {(stage === "nominations" || stage === "contributions" || stage === "live") && (
        <ul className={styles.cards}>
          {teams.map((teamId) => {
            const team = getTeam(teamId);
            const rep = representatives.find((item) => item.teamId === teamId);
            return <li key={teamId}><span className={styles.cardIcon} aria-hidden="true">{team.icon}</span><strong>{rep?.nickname ?? "Oczekuje na wybór"}</strong><span>{team.name}</span></li>;
          })}
        </ul>
      )}
      {stage === "result" && winner && reward && (
        <div className={styles.winner}>
          <h2>GRA 1 ZAKOŃCZONA</h2>
          <p className={styles.winnerName}>{winner.nickname}</p>
          <p>{getTeam(winner.teamId).name}</p>
          <p>Punkt drużynowy otrzymuje {getTeam(state.firstScoreTeam ?? winner.teamId).name}.</p>
          <GoldRewardList reward={reward} />
        </div>
      )}
      {six && !state.sixResult && <p className={styles.intro}>{stage === "six-intro" ? "Wybierz jeden numer od 1 do 6. Trafione zakłady odzyskają stawki i podzielą żetony z nietrafionych głosów." : goldStageLabel[stage]}</p>}
      {state.sixResult && <GoldNumberReveal state={state} />}
    </section>
  );
}

export function GoldChallengeScreen({ snapshot, viewerPlayerId, refresh }: { snapshot: GameSnapshot; viewerPlayerId?: number; refresh: () => Promise<void> }) {
  const state = snapshot.goldChallenge;
  const [number, setNumber] = useState<{ revision: string; value: number } | null>(null);
  const voter = snapshot.players.find((player) => player.id === viewerPlayerId);
  const eligible = voter && state.teams.includes(voter.teamId);
  const teammates = eligible ? snapshot.players.filter((player) => player.teamId === voter.teamId) : [];
  const { send, pending, error } = useSegmentCommand<GoldAction["command"]>("/api/segment/gold-challenge", state.revision, refresh);
  return (
    <div className={styles.wrapper}>
      <GoldBoard state={state} />
      {state.stage === "six-voting" && voter && <section className={styles.panel} aria-label="Wybór numeru">
        <h2>Wybierz swój numer</h2>
        <p>Saldo: {formatPolishChips(voter.tokens)} żetonów · Stawka: 10 żetonów</p>
        <GoldNumberGrid value={state.viewerNumber ?? (number?.revision === state.revision ? number.value : null)}
          onSelect={(value) => setNumber({ revision: state.revision, value })} disabled={pending || state.viewerNumber !== null} />
        {state.viewerNumber !== null ? <p role="status">Twój wybór został zapisany: {state.viewerNumber}.</p>
          : <button type="button" className={styles.primary} disabled={pending || number?.revision !== state.revision}
            onClick={() => number && void send({ action: "number-vote", number: number.value })}>Zatwierdź wybór</button>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>}
      {state.sixResult && <section className={styles.panel} aria-label="Aktualne salda">
        <h2>Aktualne salda</h2>
        <ul className={styles.ledger}>{snapshot.players.map((player) => <li key={player.id}><span>{player.nickname}</span><strong>{formatPolishChips(player.tokens)} żet.</strong></li>)}</ul>
      </section>}
      {state.stage === "nominations" && voter && (
        <section className={styles.panel} aria-label="Nominacja przedstawiciela">
          <h2>Nominuj zawodnika</h2>
          {eligible ? <>
            <p>Wskaż jedną osobę ze swojej drużyny.</p>
            <div className={styles.actions}>
              {teammates.map((player) => <button key={player.id} className={styles.button} type="button" aria-pressed={state.viewerNominationId === player.id} disabled={pending || state.viewerNominationId === player.id} onClick={() => void send({ action: "nominate", playerId: player.id })}>{player.nickname}</button>)}
            </div>
            {state.viewerNominationId !== null && <p role="status">Twój głos został zapisany.</p>}
          </> : <p>Twoja drużyna obserwuje to wyzwanie.</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

export function GoldNumberGrid({ value, onSelect, disabled }: { value: number | null; onSelect: (number: number) => void; disabled?: boolean }) {
  return <div className={styles.numberGrid} role="group" aria-label="Numery od 1 do 6">
    {[1, 2, 3, 4, 5, 6].map((number) => <button className={styles.button} type="button" key={number}
      disabled={disabled} aria-pressed={value === number} onClick={() => onSelect(number)}>{number}</button>)}
  </div>;
}

function GoldNumberReveal({ state }: { state: GoldSnapshot }) {
  const result = state.sixResult;
  if (!result) return null;
  const winners = result.transfers.filter((entry) => entry.correct);
  const own = state.viewerNumber;
  return <div className={styles.winner}>
    <h2>WYGRYWA NUMER</h2>
    <strong className={styles.revealNumber}>{result.number}</strong>
    {result.scoreNumber !== undefined && <p>Po korekcie każdy głos na numer {result.scoreNumber} liczy się jako 1 punkt dla drużyny głosującego.</p>}
    <p>Trafione głosy: {result.correct} · Nietrafione głosy: {result.incorrect}</p>
    {result.void ? <p>Nikt nie wytypował poprawnego numeru. Wszystkie stawki zostały zwrócone.</p> : <>
      <p className={styles.rewardTotal}>Pula zysku: <strong>{formatPolishChips(result.pool)}</strong> żetonów</p>
      <ul className={styles.ledger} aria-label="Zwycięzcy i zysk na osobę">
        {winners.map((entry) => <li key={entry.playerId}><span>{entry.nickname}</span><strong>+{formatPolishChips(entry.delta)} żet.</strong></li>)}
      </ul>
      {own !== null && <p>{own === result.number ? "Twój typ był trafiony. Stawka została zwrócona wraz z wygraną." : "Twój typ był nietrafiony. Tracisz 10 żetonów."}</p>}
    </>}
    {result.transfers.length > 0 && <details><summary>Wyniki wszystkich głosujących</summary>
      <ul className={styles.ledger}>{result.transfers.map((entry) => <li key={entry.playerId}><span>{entry.nickname}</span><strong>{result.void ? "Zwrot 10 żet." : formatPolishChips(entry.delta) + " żet."}</strong></li>)}</ul>
    </details>}
    {state.reward && <details><summary>Wynik pierwszej gry</summary>
      <p>{state.winner && getTeam(state.winner.teamId).name}</p><GoldRewardList reward={state.reward} />
      {state.winner && <p>Punkt drużynowy otrzymuje {getTeam(state.firstScoreTeam ?? state.winner.teamId).name}.</p>}
      {state.firstContributors && <ul className={styles.ledger} aria-label="Wpłaty graczy">{state.firstContributors.map((player) =>
        <li key={player.id}><span>{player.nickname}</span><strong>−10 żet.</strong></li>)}</ul>}
    </details>}
    {state.stage === "completed" && <p>Segment zakończony.</p>}
  </div>;
}
