"use client";

import { useState } from "react";

import { GoldBoard, GoldRewardList } from "@/components/gold-challenge-screen";
import styles from "@/components/gold-challenge.module.css";
import { TEAMS, getTeam } from "@/lib/constants";
import type { GameSnapshot, GoldRepresentative, Player, TeamId } from "@/lib/types";
import type { GoldAction } from "@/lib/validation";

type Command = GoldAction["command"];

function TeamPicker({ send }: { send: (command: Command) => void }) {
  const [teams, setTeams] = useState<TeamId[]>([]);
  return (
    <>
      <h2>Drużyny wyzwania</h2>
      <p>Wybierz od dwóch do czterech drużyn. Puste drużyny mogą potwierdzić przedstawiciela, kiedy dołączy zawodnik.</p>
      <div className={styles.actions} role="group" aria-label="Uczestniczące drużyny">
        {TEAMS.map((team) => <button className={styles.button} type="button" aria-pressed={teams.includes(team.id)} key={team.id} onClick={() => {
          setTeams((current) => current.includes(team.id) ? current.filter((id) => id !== team.id) : [...current, team.id]);
        }}>{team.name}</button>)}
      </div>
      <button className={styles.primary} type="button" disabled={teams.length < 2} onClick={() => send({ action: "teams", teams })}>Potwierdź udział drużyn</button>
    </>
  );
}

function TeamNominations({ team, members, confirmed, votes, send }: { team: TeamId; members: Player[]; confirmed?: GoldRepresentative; votes: Record<number, number>; send: (command: Command) => void }) {
  const [selection, setSelection] = useState(confirmed?.id ?? 0);
  const options = [...members].sort((a, b) => (votes[b.id] ?? 0) - (votes[a.id] ?? 0) || a.id - b.id);
  const selected = options.some((member) => member.id === selection);
  return (
    <form className={styles.nominationCard} onSubmit={(event) => { event.preventDefault(); if (selected) send({ action: "representative", playerId: selection }); }}>
      <h3>{getTeam(team).name}</h3>
      {options.length ? (
        <>
          <label>Przedstawiciel
            <select className={styles.select} value={selected ? selection : 0} onChange={(event) => setSelection(Number(event.target.value))}>
              <option value={0}>Wybierz zawodnika</option>
              {options.map((player) => <option key={player.id} value={player.id}>{player.nickname} · głosy: {votes[player.id] ?? 0}</option>)}
            </select>
          </label>
          <button className={styles.button} type="submit" disabled={!selected || confirmed?.id === selection}>Zatwierdź przedstawiciela</button>
        </>
      ) : <p>Brak aktywnych graczy w drużynie.</p>}
    </form>
  );
}

function WinnerPicker({ snapshot, send }: { snapshot: GameSnapshot; send: (command: Command) => void }) {
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const state = snapshot.goldChallenge;
  const winner = state.representatives.find((rep) => rep.id === winnerId);
  const preview = winner && state.adminPreviews?.[winner.teamId];
  return (
    <>
      <h2>Wskaż zwycięzcę</h2>
      <div className={styles.winnerChoices} role="group" aria-label="Zwycięzca wyzwania">
        {state.teams.map((team) => {
          const rep = state.representatives.find((representative) => representative.teamId === team);
          return rep && <button className={styles.button} type="button" key={rep.id} aria-pressed={winnerId === rep.id} onClick={() => setWinnerId(rep.id)}><strong>{rep.nickname}</strong><span>{getTeam(rep.teamId).name}</span></button>;
        })}
      </div>
      {preview && <section className={styles.preview} aria-label="Podgląd podziału żetonów">
        <h3>Podgląd podziału żetonów</h3>
        <GoldRewardList reward={preview.reward} />
        {preview.shortfalls.length > 0 && <p className={styles.error}>Mniej niż 10 żetonów mają: {preview.shortfalls.join(", ")}.</p>}
        {(preview.reward.losingCount === 0 || preview.reward.shares.length === 0) && <p className={styles.error}>Do rozliczenia potrzebni są aktywni gracze po obu stronach.</p>}
      </section>}
      <button className={styles.primary} type="button" disabled={!winner} onClick={() => winner && send({ action: "winner", playerId: winner.id })}>Zatwierdź zwycięzcę</button>
    </>
  );
}

export function GoldChallengeAdminControls({ snapshot, disabled, send, error }: { snapshot: GameSnapshot; disabled: boolean; send: (command: Command) => void; error: string }) {
  const state = snapshot.goldChallenge;
  const activeRepresentatives = state.representatives.filter((representative) => snapshot.players.some((player) => player.id === representative.id));
  const ready = state.teams.every((team) => activeRepresentatives.some((representative) => representative.teamId === team));
  return (
    <section className={styles.wrapper} aria-label="Sterowanie złotym wyzwaniem">
      <GoldBoard state={state} />
      <fieldset className={styles.panel} disabled={disabled}>
        <legend>Panel złotego wyzwania</legend>
        {state.stage === "intro" && <TeamPicker send={send} />}
        {state.stage === "nominations" && (
          <>
            <div className={styles.nominationGrid}>
              {state.teams.map((team) => {
                const rep = activeRepresentatives.find((representative) => representative.teamId === team);
                return <TeamNominations key={`${team}-${rep?.id ?? 0}`} team={team} members={snapshot.players.filter((player) => player.teamId === team)} confirmed={rep} votes={state.adminNominations ?? {}} send={send} />;
              })}
            </div>
            <button className={styles.primary} type="button" disabled={!ready} onClick={() => send({ action: "start" })}>Rozpocznij wyzwanie</button>
          </>
        )}
        {state.stage === "live" && <WinnerPicker snapshot={snapshot} send={send} />}
        {state.stage === "result" && <button className={styles.primary} type="button" onClick={() => send({ action: "complete" })}>Zakończ segment</button>}
        {state.stage === "completed" && <p>Wynik i wypłaty zostały zapisane.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </fieldset>
    </section>
  );
}
