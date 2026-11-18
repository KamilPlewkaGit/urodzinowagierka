"use client";

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
  live: "Wielkie wyzwanie trwa",
  result: "Zwycięzcy złotego wyzwania",
  completed: "Segment zakończony",
};

export function GoldRewardList({ reward }: { reward: GoldReward }) {
  return (
    <>
      <p className={styles.rewardTotal}><strong>{formatPolishChips(reward.pool)}</strong> żetonów w puli</p>
      <p>{reward.losingCount} graczy wpłaca po 10 żetonów.</p>
      <ul className={styles.ledger} aria-label="Podział puli">
        {reward.shares.map(({ playerId, nickname, amount }) => <li key={playerId}><span>{nickname}</span><strong>+{formatPolishChips(amount)} żet.</strong></li>)}
      </ul>
    </>
  );
}

export function GoldBoard({ state }: { state: GoldSnapshot }) {
  const { stage, teams, representatives, reward, winner } = state;
  const celebrating = stage === "result" || stage === "completed";
  return (
    <section className={`${styles.stage} ${celebrating ? styles.celebrating : ""}`} aria-label={GOLD_TITLE}>
      <div className={styles.dust} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div>
      <div className={styles.chip} aria-hidden="true">♦</div>
      <h1 className={styles.title}>{GOLD_TITLE}</h1>
      {stage === "intro" && (
        <>
          <p className={styles.intro}>Każda drużyna wybiera swojego najdzielniejszego zawodnika, który będzie ją reprezentował w wielkim wyzwaniu. Zwycięzca zdobywa ogromną pulę żetonów dla całej swojej drużyny!</p>
          <ul className={styles.rules}>
            <li>Każda uczestnicząca drużyna nominuje jednego przedstawiciela.</li>
            <li>Prowadzący wybiera zwycięzcę wyzwania.</li>
            <li>Każdy aktywny gracz z przegranej drużyny wpłaca 10 żetonów.</li>
            <li>Cała pula jest dzielona między aktywnych członków zwycięskiej drużyny.</li>
            <li>Wyzwanie odbywa się bez zakładów.</li>
          </ul>
        </>
      )}
      {stage === "nominations" && <h2 className={styles.subtitle}>Nominacje przedstawicieli</h2>}
      {stage === "live" && <><div className={styles.versus}>VS</div><p className={styles.subtitle}>Wielkie wyzwanie trwa!</p></>}
      {(stage === "nominations" || stage === "live") && (
        <ul className={styles.cards}>
          {teams.map((teamId) => {
            const team = getTeam(teamId);
            const rep = representatives.find((item) => item.teamId === teamId);
            return <li key={teamId}><span className={styles.cardIcon} aria-hidden="true">{team.icon}</span><strong>{rep?.nickname ?? "Oczekuje na wybór"}</strong><span>{team.name}</span></li>;
          })}
        </ul>
      )}
      {celebrating && winner && reward && (
        <div className={styles.winner}>
          <h2>ZWYCIĘZCY!</h2>
          <p className={styles.winnerName}>{winner.nickname}</p>
          <p>{getTeam(winner.teamId).name}</p>
          <GoldRewardList reward={reward} />
          {stage === "completed" && <p>Segment zakończony.</p>}
        </div>
      )}
    </section>
  );
}

export function GoldChallengeScreen({ snapshot, viewerPlayerId, refresh }: { snapshot: GameSnapshot; viewerPlayerId?: number; refresh: () => Promise<void> }) {
  const state = snapshot.goldChallenge;
  const voter = snapshot.players.find((player) => player.id === viewerPlayerId);
  const eligible = voter && state.teams.includes(voter.teamId);
  const teammates = eligible ? snapshot.players.filter((player) => player.teamId === voter.teamId) : [];
  const { send, pending, error } = useSegmentCommand<GoldAction["command"]>("/api/segment/gold-challenge", state.revision, refresh);
  return (
    <div className={styles.wrapper}>
      <GoldBoard state={state} />
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
