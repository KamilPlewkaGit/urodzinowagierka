"use client";

import { useState } from "react";

import { GoldBoard, GoldNumberGrid, GoldRewardList } from "@/components/gold-challenge-screen";
import styles from "@/components/gold-challenge.module.css";
import { formatPolishChips } from "@/lib/chips";
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
        <GoldRewardList reward={preview} />
      </section>}
      <button className={styles.primary} type="button" disabled={!winner} onClick={() => winner && send({ action: "winner", playerId: winner.id })}>Zatwierdź zwycięzcę i wypłatę</button>
    </>
  );
}

export function GoldChallengeAdminControls({ snapshot, disabled, send, error }: { snapshot: GameSnapshot; disabled: boolean; send: (command: Command) => void; error: string }) {
  const state = snapshot.goldChallenge;
  const contribution = state.adminContributions;
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
            <button className={styles.primary} type="button" disabled={!ready} onClick={() => send({ action: "prepare" })}>Przejdź do wpłat</button>
          </>
        )}
        {state.stage === "contributions" && contribution && <>
          <h2>Wpłaty do wspólnej puli</h2>
          <p>Gracze: {contribution.players} · Wpłata od osoby: 10 żetonów · Pula: {contribution.pool} żetonów</p>
          {contribution.shortfalls.length > 0 && <p className={styles.error}>Mniej niż 10 żetonów mają: {contribution.shortfalls.join(", ")}.</p>}
          <button className={styles.primary} type="button" disabled={!ready || contribution.shortfalls.length > 0} onClick={() => send({ action: "start" })}>Pobierz wpłaty i rozpocznij wyzwanie</button>
        </>}
        {state.stage === "live" && <WinnerPicker snapshot={snapshot} send={send} />}
        {state.stage === "result" && <button className={styles.primary} type="button" onClick={() => send({ action: "next-game" })}>Przejdź do gry nr 2</button>}
        {state.stage.startsWith("six-") && <GoldNumberAdmin key={state.revision} snapshot={snapshot} send={send} />}
        {state.stage === "completed" && <p>Wynik i wypłaty zostały zapisane.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </fieldset>
    </section>
  );
}

function GoldNumberAdmin({ snapshot, send }: { snapshot: GameSnapshot; send: (command: Command) => void }) {
  const { stage, adminNumbers: voting, sixResult } = snapshot.goldChallenge;
  const [number, setNumber] = useState<number | null>(null);
  const selected = voting?.pendingNumber ?? number;
  const correct = selected ? voting?.counts?.[selected - 1] ?? 0 : 0;
  const voted = new Set(voting?.votedIds ?? []);
  const incorrect = voted.size - correct;
  const prizeUnits = BigInt(incorrect) * 100_000n;
  const winnerCount = BigInt(Math.max(1, correct));
  const minimum = prizeUnits / winnerCount;
  const maximum = minimum + (prizeUnits % winnerCount > 0n ? 1n : 0n);
  const asChips = (units: bigint) => formatPolishChips((units / 10_000n) + "." + String(units % 10_000n).padStart(4, "0"));
  if (stage === "six-intro") return <button className={styles.primary} type="button" onClick={() => send({ action: "number-open" })}>Otwórz głosowanie</button>;
  if (stage === "six-result") return <div className={styles.actions}>
    {sixResult?.void && <button className={styles.button} type="button" onClick={() => send({ action: "number-restart" })}>Otwórz nową rundę głosowania</button>}
    <button className={styles.primary} type="button" onClick={() => send({ action: "complete" })}>Zakończ segment</button>
  </div>;
  return <>
    <p>Oddane głosy: {voted.size} / {snapshot.players.length} · Zarezerwowane żetony: {voting?.reserved ?? "0"}</p>
    <ul className={styles.ledger}>{snapshot.players.map((player) => <li key={player.id}><span>{player.nickname}</span><strong>{voted.has(player.id)
      ? "Zagłosowano" : stage === "six-voting" ? "Czeka na głos" : "Brak głosu"}</strong></li>)}</ul>
    {stage === "six-voting" &&
      <button className={styles.primary} type="button" onClick={() => send({ action: "number-close" })}>Zamknij głosowanie</button>
    }
    {voting?.counts && <p>{voting.counts.map((count, index) => (index + 1) + " → " + count).join(" · ")}</p>}
    {stage === "six-closed" && <>
      <h2>Wybierz poprawny numer</h2>
      <GoldNumberGrid value={number} onSelect={setNumber} />
      <button className={styles.primary} type="button" disabled={number === null}
        onClick={() => number !== null && send({ action: "number-confirm", number })}>Zatwierdź wynik</button>
    </>}
    {selected !== null && <p>Numer {selected} · Trafione: {correct} · Nietrafione: {incorrect}. {correct ? "Pula zysku: " + (incorrect * 10) + " żetonów." : "Wszystkie stawki wrócą do graczy."}</p>}
    {selected !== null && correct > 0 && <p>Zysk na trafiony głos: {asChips(minimum)}{minimum !== maximum && "–" + asChips(maximum)} żetonów, wraz ze zwrotem 10 żetonów stawki.</p>}
    {stage === "six-confirmed" && <button className={styles.primary} type="button" onClick={() => send({ action: "number-settle" })}>Potwierdź rozliczenie i pokaż wynik</button>}
  </>;
}
