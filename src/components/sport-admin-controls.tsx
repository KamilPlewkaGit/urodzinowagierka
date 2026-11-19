"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { TEAMS, getTeam } from "@/lib/constants";
import { SPORT_BONUS_ROUND_COUNT, SPORT_CHALLENGE_COUNT, SPORT_TITLE, getSportChallenge } from "@/lib/sport";
import type { GameSnapshot, SportPairing, TeamId, TeamMeta } from "@/lib/types";

interface SportAdminControlsProps {
  snapshot: GameSnapshot;
  onRefresh: () => Promise<void>;
}

type PairValues = { aA: TeamId | null; aB: TeamId | null; bA: TeamId | null; bB: TeamId | null };
type ApiError = { error?: string };
const EMPTY_PAIRS: PairValues = { aA: null, aB: null, bA: null, bB: null };

function samePairs(left: PairValues, right: PairValues) {
  return left.aA === right.aA && left.aB === right.aB && left.bA === right.bA && left.bB === right.bB;
}

function sameRankValues(left: Record<string, string>, right: Record<string, string>) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

function sameLimbValues(left: Record<TeamId, string>, right: Record<TeamId, string>) {
  return TEAMS.every((team) => left[team.id] === right[team.id]);
}

function teamStyle(team: TeamMeta) {
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

function TeamChoice({ team, selected, disabled, onSelect }: { team: TeamMeta; selected: boolean; disabled: boolean; onSelect: () => void }) {
  return <button type="button" className={`team-choice${selected ? " is-selected" : ""}`} style={teamStyle(team)} onClick={onSelect} disabled={disabled} aria-pressed={selected}><span className="team-icon">{team.icon}</span><span className="team-choice-copy"><strong>{team.name}</strong><small>{team.tagline}</small></span><span className="team-check">{selected ? "✓" : ""}</span></button>;
}

function pairFor(slot: "a" | "b", pairings: readonly SportPairing[]) {
  return pairings.find((pairing) => pairing.slot === slot) ?? null;
}

function playerRankKey(playerId: number) {
  return String(playerId);
}

function SportVersus({ snapshot, pair, numbers }: { snapshot: GameSnapshot; pair: SportPairing; numbers?: { teamA: readonly number[]; teamB: readonly number[] } }) {
  const name = (teamId: TeamId, values: readonly number[]) => values.map((number) => {
    const assignment = snapshot.sport.playerNumbers.find((entry) => entry.teamId === teamId && entry.number === number);
    return `Ranga #${number} ${snapshot.players.find((player) => player.id === assignment?.playerId)?.nickname ?? "nieprzypisany"}`;
  }).join(" · ");
  const teamA = getTeam(pair.teamAId);
  const teamB = getTeam(pair.teamBId);
  return <div className="floor-duelists"><strong style={{ color: teamA.color, borderColor: teamA.color }}>{teamA.icon} {teamA.name}{numbers ? <small>{name(teamA.id, numbers.teamA)}</small> : null}</strong><span>VS</span><strong style={{ color: teamB.color, borderColor: teamB.color }}>{teamB.icon} {teamB.name}{numbers ? <small>{name(teamB.id, numbers.teamB)}</small> : null}</strong></div>;
}

export function SportAdminControls({ snapshot, onRefresh }: SportAdminControlsProps) {
  const sport = snapshot.sport;
  const [pairs, setPairs] = useState<PairValues>(EMPTY_PAIRS);
  const [rankValues, setRankValues] = useState<Record<string, string>>({});
  const [limbValues, setLimbValues] = useState<Record<TeamId, string>>({ royal: "0", ruby: "0", emerald: "0", onyx: "0" });
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [bonusPoints, setBonusPoints] = useState("0");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const setupSyncKeyRef = useRef<string | null>(null);
  const bonusSyncKeyRef = useRef<string | null>(null);
  const challenge = sport.currentChallenge;
  const definition = challenge ? getSportChallenge(challenge.sequence) : null;
  const pair = definition ? pairFor(definition.pairSlot, sport.pairings) : null;
  const bonus = sport.currentBonus;
  const winner = challenge?.winnerTeamId ? getTeam(challenge.winnerTeamId) : null;
  const bonusWinner = bonus?.winnerTeamId ? getTeam(bonus.winnerTeamId) : null;
  const playersForTeam = (teamId: TeamId) => snapshot.players.filter((player) => player.teamId === teamId);
  const rankingsComplete = TEAMS.every((team) => {
    const members = playersForTeam(team.id);
    return members.length > 0 && members.every((player) => Boolean(rankValues[playerRankKey(player.id)]));
  });
  const rankingsSaved = TEAMS.every((team) => {
    const members = playersForTeam(team.id);
    return members.length > 0 && members.every((player) => sport.playerNumbers.some((assignment) => assignment.teamId === team.id && assignment.playerId === player.id));
  });
  const requiredChallengeRanksAvailable = TEAMS.every((team) => playersForTeam(team.id).length >= 5);
  const setupSyncKey = useMemo(() => [
    sport.stage,
    sport.pairings.map((pairing) => `${pairing.slot}:${pairing.teamAId}:${pairing.teamBId}`).join(","),
    sport.playerNumbers.map((assignment) => `${assignment.teamId}:${assignment.playerId}:${assignment.number}`).join(","),
    snapshot.players.map((player) => `${player.id}:${player.teamId}`).join(","),
  ].join("|"), [snapshot.players, sport.pairings, sport.playerNumbers, sport.stage]);
  const bonusSyncKey = useMemo(() => bonus
    ? `${sport.stage}|${bonus.id}|${bonus.requirements.map((requirement) => `${requirement.teamId}:${requirement.limbs}`).join(",")}`
    : sport.stage, [bonus, sport.stage]);

  useEffect(() => {
    if (sport.stage !== "setup") {
      setupSyncKeyRef.current = null;
      return;
    }
    if (setupSyncKeyRef.current === setupSyncKey) return;
    setupSyncKeyRef.current = setupSyncKey;

    const nextPairs: PairValues = sport.pairings.length === 2 ? (() => {
      const pairA = pairFor("a", sport.pairings);
      const pairB = pairFor("b", sport.pairings);
      return { aA: pairA?.teamAId ?? null, aB: pairA?.teamBId ?? null, bA: pairB?.teamAId ?? null, bB: pairB?.teamBId ?? null };
    })() : EMPTY_PAIRS;
    const nextRankValues = Object.fromEntries(sport.playerNumbers.map((assignment) => [playerRankKey(assignment.playerId), String(assignment.number)]));
    setPairs((current) => samePairs(current, nextPairs) ? current : nextPairs);
    setRankValues((current) => sameRankValues(current, nextRankValues) ? current : nextRankValues);
  }, [setupSyncKey]);

  useEffect(() => {
    if (sport.stage !== "bonus-setup" || !bonus) {
      bonusSyncKeyRef.current = null;
      return;
    }
    if (bonusSyncKeyRef.current === bonusSyncKey) return;
    bonusSyncKeyRef.current = bonusSyncKey;
    const values = Object.fromEntries(TEAMS.map((team) => [team.id, String(bonus.requirements.find((requirement) => requirement.teamId === team.id)?.limbs ?? 0)])) as Record<TeamId, string>;
    setLimbValues((current) => sameLimbValues(current, values) ? current : values);
    setWinnerTeamId((current) => current === null ? current : null);
    setBonusPoints((current) => current === "0" ? current : "0");
  }, [bonusSyncKey]);

  function confirmStart() {
    if (window.confirm("Zamknąć obstawianie i rozpocząć wyzwanie? Złożone zakłady zostaną rozliczone po wyniku.")) {
      void post("start-challenge", "/api/segment/sport/start-challenge");
    }
  }

  async function post(action: string, endpoint: string, body?: object) {
    setError("");
    setPending(action);
    try {
      const response = await fetch(endpoint, { method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) { setError(payload?.error ?? "Nie udało się wykonać tej operacji."); return false; }
      await onRefresh();
      return true;
    } catch {
      setError("Nie udało się połączyć z usługą gry.");
      return false;
    } finally {
      setPending(null);
    }
  }

  function choosePair(position: keyof PairValues, teamId: TeamId) {
    setPairs((current) => ({ ...current, [position]: current[position] === teamId ? null : teamId }));
  }

  function teamAlreadyUsed(teamId: TeamId, position: keyof PairValues) {
    return (Object.entries(pairs) as [keyof PairValues, TeamId | null][]).some(([key, selected]) => key !== position && selected === teamId);
  }

  async function savePairs() {
    if (!pairs.aA || !pairs.aB || !pairs.bA || !pairs.bB) return;
    await post("pairs", "/api/segment/sport/configure", { pairA: { teamAId: pairs.aA, teamBId: pairs.aB }, pairB: { teamAId: pairs.bA, teamBId: pairs.bB }, assignments: [] });
  }

  async function saveRankings() {
    if (!pairs.aA || !pairs.aB || !pairs.bA || !pairs.bB || !rankingsComplete) return;
    const assignments = snapshot.players.map((player) => ({ teamId: player.teamId, playerId: player.id, number: Number(rankValues[playerRankKey(player.id)]) }));
    await post("rankings", "/api/segment/sport/configure", { pairA: { teamAId: pairs.aA, teamBId: pairs.aB }, pairB: { teamAId: pairs.bA, teamBId: pairs.bB }, assignments });
  }

  async function confirmWinner() {
    const selected = challenge?.winnerTeamId ?? winnerTeamId;
    if (!selected) return;
    const done = await post("finish", "/api/segment/sport/finish", { winnerTeamId: selected });
    if (done) setWinnerTeamId(null);
  }

  async function saveBonusRequirements() {
    const requirements = TEAMS.map((team) => ({ teamId: team.id, limbs: Number(limbValues[team.id]) }));
    await post("bonus-configure", "/api/segment/sport/bonus-configure", { requirements });
  }

  async function confirmBonus() {
    if (!winnerTeamId) return;
    const done = await post("bonus-finish", "/api/segment/sport/bonus-finish", { winnerTeamId, points: Number(bonusPoints) });
    if (done) setWinnerTeamId(null);
  }

  const pairReady = Boolean(pairs.aA && pairs.aB && pairs.bA && pairs.bB);
  const renderPairChoice = (position: keyof PairValues, label: string) => <fieldset className="team-fieldset"><legend>{label}</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={pairs[position] === team.id} disabled={pending !== null || (teamAlreadyUsed(team.id, position) && pairs[position] !== team.id)} onSelect={() => choosePair(position, team.id)} />)}</div></fieldset>;

  return <section className="floor-admin-section" aria-label="Sterowanie segmentem Sport"><div className="section-heading"><div><span className="eyebrow">Sport</span><h2>Sterowanie wyzwaniami</h2></div><span className="poll-note">Odświeżanie co 4 sekundy</span></div><article className="floor-admin-panel">
    {sport.stage === "intro" ? <><span className="panel-index">SPORT / START</span><h2>{SPORT_TITLE}</h2><p>Ustawisz dwie pary drużyn, rangi wszystkich graczy, osiem wyzwań i dwie rundy bonusowe.</p><button className="gold-button start-button" onClick={() => post("start", "/api/segment/sport/start")} disabled={pending !== null}>Wybierz drużyny</button></> : null}
    {sport.stage === "setup" ? <>
      <span className="panel-index">SPORT / PARY I RANGI</span>
      <h2>Wybierz drużyny</h2>
      <p>Każda drużyna może znaleźć się tylko w jednej parze. Kliknij wybraną drużynę ponownie, aby zwolnić wybór.</p>
      {renderPairChoice("aA", "Para A — pierwsza drużyna")}
      {renderPairChoice("aB", "Para A — druga drużyna")}
      {renderPairChoice("bA", "Para B — pierwsza drużyna")}
      {renderPairChoice("bB", "Para B — druga drużyna")}
      <div className="floor-admin-actions">
        <button className="secondary-button" onClick={savePairs} disabled={pending !== null || !pairReady}>Zatwierdź drużyny</button>
      </div>
      {sport.pairings.length !== 2 ? <p className="floor-waiting">Najpierw zatwierdź drużyny, aby przypisać rangi zawodnikom.</p> : <>
        <h2>Rangi zawodników</h2>
        <p>Nadajcie rangi swoim zawodnikom od 1 do końca listy zawodników danej drużyny. Dany numer ma znaczenie!</p>
        {TEAMS.map((team) => {
          const members = playersForTeam(team.id);
          const rankValuesForTeam = Array.from({ length: members.length }, (_, index) => String(index + 1));
          return <fieldset className="team-fieldset" key={team.id}>
            <legend>{team.icon} {team.name}</legend>
            {members.length === 0 ? <p className="form-error">Ta drużyna nie ma aktywnych graczy do uszeregowania.</p> : null}
            <div className="floor-pair-selectors">
              {members.map((player) => <label className="field-label" key={player.id}>Ranga dla {player.nickname}
                <select
                  className="text-input"
                  value={rankValues[playerRankKey(player.id)] ?? ""}
                  onChange={(event) => setRankValues((current) => ({ ...current, [playerRankKey(player.id)]: event.target.value }))}
                  disabled={pending !== null}
                >
                  <option value="">Wybierz rangę</option>
                  {rankValuesForTeam.map((rank) => <option
                    value={rank}
                    key={rank}
                    disabled={members.some((otherPlayer) => otherPlayer.id !== player.id && rankValues[playerRankKey(otherPlayer.id)] === rank)}
                  >{rank}</option>)}
                </select>
              </label>)}
            </div>
          </fieldset>;
        })}
        {!requiredChallengeRanksAvailable ? <p className="form-error">Każda drużyna potrzebuje co najmniej pięciu aktywnych graczy z rangami od 1 do 5, aby rozpocząć harmonogram wyzwań.</p> : null}
        <div className="floor-admin-actions">
          <button className="secondary-button" onClick={saveRankings} disabled={pending !== null || !pairReady || !rankingsComplete}>Zapisz rangi</button>
          <button className="gold-button" onClick={() => post("start-challenges", "/api/segment/sport/start-challenges")} disabled={pending !== null || !rankingsSaved || !requiredChallengeRanksAvailable}>Rozpocznij segment</button>
        </div>
      </>}
    </> : null}
    {sport.stage === "betting" && challenge && definition && pair ? <><span className="panel-index">WYZWANIE {challenge.sequence + 1}/{SPORT_CHALLENGE_COUNT} / OBSTAWIANIE</span><h2>{definition.name}</h2><p>{definition.activity}</p><SportVersus snapshot={snapshot} pair={pair} numbers={{ teamA: definition.teamANumbers, teamB: definition.teamBNumbers }} /><p>Zarejestrowane zakłady: <strong>{challenge.betCount}</strong>. Obstawianie jest opcjonalne.</p><button className="gold-button start-button" onClick={confirmStart} disabled={pending !== null}>Rozpocznij wyzwanie</button></> : null}
    {sport.stage === "live" && challenge && definition && pair ? <><span className="panel-index">WYZWANIE {challenge.sequence + 1}/{SPORT_CHALLENGE_COUNT} / W TOKU</span><h2>{definition.name}</h2><p>{definition.activity}. Zakłady są zamknięte, a pojedynek odbywa się poza aplikacją.</p><SportVersus snapshot={snapshot} pair={pair} numbers={{ teamA: definition.teamANumbers, teamB: definition.teamBNumbers }} /><fieldset className="team-fieldset"><legend>Wybierz zwycięzcę</legend><div className="team-grid"><TeamChoice team={getTeam(pair.teamAId)} selected={(challenge?.winnerTeamId ?? winnerTeamId) === pair.teamAId} disabled={pending !== null || Boolean(challenge?.winnerTeamId)} onSelect={() => setWinnerTeamId(pair.teamAId)} /><TeamChoice team={getTeam(pair.teamBId)} selected={(challenge?.winnerTeamId ?? winnerTeamId) === pair.teamBId} disabled={pending !== null || Boolean(challenge?.winnerTeamId)} onSelect={() => setWinnerTeamId(pair.teamBId)} /></div></fieldset><button className="gold-button start-button" onClick={confirmWinner} disabled={pending !== null || !(challenge?.winnerTeamId ?? winnerTeamId)}>Zatwierdź wynik</button></> : null}
    {sport.stage === "result" && challenge && winner ? <><span className="panel-index">WYZWANIE {challenge.sequence + 1}/{SPORT_CHALLENGE_COUNT} / WYNIK</span><h2>Wygrywa {winner.name}.</h2><p>Zakłady zostały rozliczone zgodnie z zasadami Sportu.</p><button className="gold-button start-button" onClick={() => post("next", "/api/segment/sport/next")} disabled={pending !== null}>{challenge.sequence === SPORT_CHALLENGE_COUNT - 1 ? "Przejdź do wyzwań bonusowych" : "Następne wyzwanie"}</button></> : null}
    {sport.stage === "bonus-setup" && bonus ? <><span className="panel-index">WYZWANIE BONUSOWE / RUNDA {bonus.sequence + 1}/{SPORT_BONUS_ROUND_COUNT}</span><h2>Ustal liczbę kończyn</h2><p>Wszystkie cztery drużyny biorą udział jednocześnie. Nie ma zakładów.</p><div className="floor-pair-selectors">{TEAMS.map((team) => <label className="field-label" key={team.id}>{team.icon} {team.name}<input className="text-input" type="number" min="0" max="100" inputMode="numeric" value={limbValues[team.id]} onChange={(event) => setLimbValues((current) => ({ ...current, [team.id]: event.target.value }))} disabled={pending !== null} /></label>)}</div><div className="floor-admin-actions"><button className="secondary-button" onClick={saveBonusRequirements} disabled={pending !== null}>Zatwierdź wymagania</button><button className="gold-button" onClick={() => post("bonus-start", "/api/segment/sport/bonus-start")} disabled={pending !== null || bonus.requirements.length !== 4}>Rozpocznij wyzwanie bonusowe</button></div></> : null}
    {sport.stage === "bonus-live" && bonus ? <><span className="panel-index">WYZWANIE BONUSOWE / RUNDA {bonus.sequence + 1} / W TOKU</span><h2>Wybierz zwycięzcę</h2><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={winnerTeamId === team.id} disabled={pending !== null} onSelect={() => setWinnerTeamId(team.id)} />)}</div><label className="field-label">Punkty bonusowe<input className="text-input" type="number" min="0" max="100" inputMode="numeric" value={bonusPoints} onChange={(event) => setBonusPoints(event.target.value)} disabled={pending !== null} /></label><button className="gold-button start-button" onClick={confirmBonus} disabled={pending !== null || !winnerTeamId}>Zatwierdź wynik</button></> : null}
    {sport.stage === "bonus-result" && bonus && bonusWinner ? <><span className="panel-index">WYZWANIE BONUSOWE / RUNDA {bonus.sequence + 1} / WYNIK</span><h2>Wygrywa {bonusWinner.name}.</h2><p>Dodano {bonus.points ?? 0} pkt do wyniku drużyny. Żetony pozostały bez zmian.</p><button className="gold-button start-button" onClick={() => post("next", "/api/segment/sport/next")} disabled={pending !== null}>{bonus.sequence === SPORT_BONUS_ROUND_COUNT - 1 ? "Zakończ segment Sport" : "Następna runda bonusowa"}</button></> : null}
    {sport.stage === "results" ? <><span className="panel-index">SPORT / WYNIKI</span><h2>Segment zakończony.</h2><p>Rozegrano osiem wyzwań i dwie rundy bonusowe.</p></> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </article></section>;
}
