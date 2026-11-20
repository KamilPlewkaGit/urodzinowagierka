"use client";

import { useState } from "react";
import { formatChips } from "@/lib/chips";
import { TEAMS, getTeam, STANDARD_DUEL_BET_DESCRIPTION, STANDARD_DUEL_BET_STAKE } from "@/lib/constants";
import { SPORT_TITLE, getSportChallenge } from "@/lib/sport";
import type { GameSnapshot, Session, SportPairing, TeamId } from "@/lib/types";

interface SportScreenProps {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerRole: Session["role"];
  viewerPlayerId?: number;
}

type ApiError = { error?: string };

function pairFor(slot: "a" | "b", pairings: readonly SportPairing[]) {
  return pairings.find((pairing) => pairing.slot === slot) ?? null;
}

function playerNames(snapshot: GameSnapshot, teamId: TeamId, numbers: readonly number[]) {
  return numbers.map((number) => {
    const assignment = snapshot.sport.playerNumbers.find((entry) => entry.teamId === teamId && entry.number === number);
    const player = assignment ? snapshot.players.find((candidate) => candidate.id === assignment.playerId) : null;
    return `Ranga #${number} ${player?.nickname ?? "nieprzypisany"}`;
  }).join(" · ");
}

function SportVersus({ snapshot, pair, teamANumbers, teamBNumbers }: { snapshot: GameSnapshot; pair: SportPairing; teamANumbers?: readonly number[]; teamBNumbers?: readonly number[] }) {
  const teamA = getTeam(pair.teamAId);
  const teamB = getTeam(pair.teamBId);
  return <><div className="floor-duelists" aria-label={`${teamA.name} kontra ${teamB.name}`}><strong style={{ color: teamA.color, borderColor: teamA.color }}>{teamA.icon} {teamA.name}{teamANumbers ? <small>{playerNames(snapshot, teamA.id, teamANumbers)}</small> : null}</strong><span>VS</span><strong style={{ color: teamB.color, borderColor: teamB.color }}>{teamB.icon} {teamB.name}{teamBNumbers ? <small>{playerNames(snapshot, teamB.id, teamBNumbers)}</small> : null}</strong></div></>;
}

export function SportScreen({ snapshot, refresh, viewerRole, viewerPlayerId }: SportScreenProps) {
  const [error, setError] = useState("");
  const [betting, setBetting] = useState(false);

  async function placeBet(targetTeamId: TeamId) {
    setError("");
    setBetting(true);
    try {
      const response = await fetch("/api/segment/sport/bet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetTeamId }) });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) setError(payload?.error ?? "Nie udało się postawić zakładu.");
      else await refresh();
    } catch {
      setError("Nie udało się połączyć z usługą zakładów.");
    } finally {
      setBetting(false);
    }
  }

  const sport = snapshot.sport;
  const challenge = sport.currentChallenge;
  const definition = challenge ? getSportChallenge(challenge.sequence) : null;
  const pair = definition ? pairFor(definition.pairSlot, sport.pairings) : null;
  const viewer = viewerPlayerId === undefined ? null : snapshot.players.find((player) => player.id === viewerPlayerId) ?? null;
  const viewerRank = viewer ? sport.playerNumbers.find((assignment) => assignment.playerId === viewer.id)?.number ?? null : null;
  const viewerIsCompeting = viewer !== null && pair !== null && (viewer.teamId === pair.teamAId || viewer.teamId === pair.teamBId);
  const winner = challenge?.winnerTeamId ? getTeam(challenge.winnerTeamId) : null;
  const bonus = sport.currentBonus;
  const bonusWinner = bonus?.winnerTeamId ? getTeam(bonus.winnerTeamId) : null;

  return <>
    {viewerRank && sport.stage !== "setup" ? <p className="floor-waiting">Twoja ranga: #{viewerRank}</p> : null}
    <section className="game-stage floor-stage"><div className="game-stage-content">
      {sport.stage === "intro" ? <><span className="eyebrow">Sport</span><h1>{SPORT_TITLE}</h1><p>Każdy gra indywidualnie, z wyjątkiem wyzwań dla dwuosobowych składów. Prowadzący ustala dwie pary drużyn i rangi zawodników.</p><div className="segment-rules"><span><strong>Wyzwania główne:</strong> 8</span><span><strong>Wyzwania bonusowe:</strong> 2</span><span><strong>Zakłady:</strong> pozostałe drużyny</span></div></> : null}
      {sport.stage === "setup" ? <><span className="eyebrow">Sport · przygotowanie</span><h1>Ustalanie <em>par i rang.</em></h1><p>Nadajcie rangi swoim zawodnikom od 1 do końca listy zawodników danej drużyny. Dany numer ma znaczenie!</p>{viewerRole === "player" && <p>Twoje przypisanie: <strong>{viewerRank ? `ranga #${viewerRank}` : "oczekuje na wybór"}</strong>.</p>}{sport.pairings.length === 2 ? sport.pairings.map((configuredPair) => <SportVersus key={configuredPair.slot} snapshot={snapshot} pair={configuredPair} />) : <p className="floor-waiting">Czekamy na wybór par przez prowadzącego.</p>}</> : null}
      {sport.stage === "betting" && challenge && definition && pair ? <><span className="eyebrow">Wyzwanie {challenge.sequence + 1}/8 · obstawianie trwa</span><h1>{definition.name}</h1><p>{definition.activity}</p><SportVersus snapshot={snapshot} pair={pair} teamANumbers={definition.teamANumbers} teamBNumbers={definition.teamBNumbers} />{viewerRole === "player" && viewer && !viewerIsCompeting && !challenge.viewerBetTargetTeamId ? <div className="floor-bet-panel"><p>{challenge.betStake === STANDARD_DUEL_BET_STAKE ? STANDARD_DUEL_BET_DESCRIPTION : `Stawka w tym pojedynku to ${formatChips(challenge.betStake)} żetony.`}</p><div className="floor-bet-buttons"><button className="gold-button" disabled={betting} onClick={() => placeBet(pair.teamAId)}>Stawiam na {getTeam(pair.teamAId).name}</button><button className="gold-button" disabled={betting} onClick={() => placeBet(pair.teamBId)}>Stawiam na {getTeam(pair.teamBId).name}</button></div></div> : null}{viewerRole === "player" && viewerIsCompeting ? <p className="floor-waiting">Twoja drużyna bierze udział w tym wyzwaniu, więc nie możesz obstawiać.</p> : null}{viewerRole === "player" && challenge.viewerBetTargetTeamId ? <p className="floor-waiting">Twój zakład na {getTeam(challenge.viewerBetTargetTeamId).name} został przyjęty.</p> : null}</> : null}
      {sport.stage === "live" && challenge && definition && pair ? <><span className="eyebrow">Wyzwanie {challenge.sequence + 1}/8 · pojedynek trwa · zakłady zamknięte</span><h1>{definition.name}</h1><p>{definition.activity}</p><SportVersus snapshot={snapshot} pair={pair} teamANumbers={definition.teamANumbers} teamBNumbers={definition.teamBNumbers} /><p className="floor-waiting">Wyzwanie odbywa się poza aplikacją. Prowadzący zatwierdzi zwycięską drużynę po jego zakończeniu.</p></> : null}
      {sport.stage === "result" && challenge ? <><span className="eyebrow">Wynik wyzwania {challenge.sequence + 1}/8</span><h1>Wygrywa <em>{winner?.name ?? "wybrana drużyna"}</em>.</h1>{viewerRole === "observer" && definition && pair && <><p>{definition.name}</p><SportVersus snapshot={snapshot} pair={pair} teamANumbers={definition.teamANumbers} teamBNumbers={definition.teamBNumbers} /></>}<p>Zakłady zostały rozliczone, a salda zostały zaktualizowane.</p>{viewerRole === "player" && challenge.viewerBetResult ? <p className="floor-waiting">{challenge.viewerBetResult === "won" ? `Twój zakład wygrał. Wypłata brutto to ${formatChips(challenge.viewerBetPayout ?? "0")} żetonów.` : "Twój zakład nie wygrał."}</p> : null}</> : null}
      {sport.stage === "bonus-setup" && bonus ? <><span className="eyebrow">Wyzwanie bonusowe · runda {bonus.sequence + 1}</span><h1>Wszyscy <em>na podłodze.</em></h1><p>Prowadzący ustala wymaganą liczbę kończyn dotykających podłogi dla każdej drużyny. Nie ma zakładów.</p>{bonus.requirements.length ? <div className="segment-rules">{bonus.requirements.map((requirement) => <span key={requirement.teamId}>{getTeam(requirement.teamId).name}: <strong>{requirement.limbs}</strong></span>)}</div> : <p className="floor-waiting">Czekamy na wymagania prowadzącego.</p>}</> : null}
      {sport.stage === "bonus-live" && bonus ? <><span className="eyebrow">Wyzwanie bonusowe · runda {bonus.sequence + 1} · trwa</span><h1>Wszystkie drużyny <em>rywalizują.</em></h1><p>Pierwsza drużyna, która spełni swoje wymaganie, wygrywa. Prowadzący wybierze zwycięzcę i liczbę punktów.</p><div className="segment-rules">{bonus.requirements.map((requirement) => <span key={requirement.teamId}>{getTeam(requirement.teamId).icon} {getTeam(requirement.teamId).name}: <strong>{requirement.limbs}</strong></span>)}</div></> : null}
      {sport.stage === "bonus-result" && bonus ? <><span className="eyebrow">Wyzwanie bonusowe · runda {bonus.sequence + 1} · wynik</span><h1>Wygrywa <em>{bonusWinner?.name ?? "wybrana drużyna"}</em>.</h1><p>Do wyniku drużyny dodano <strong>{bonus.points ?? 0}</strong> pkt. Nie zmieniono żadnych żetonów.</p></> : null}
      {sport.stage === "results" ? <><span className="eyebrow">Sport · zakończono</span><h1>To już <em>koniec.</em></h1><p>Osiem wyzwań głównych i dwie rundy bonusowe zostały rozegrane.</p></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div></section>
  </>;
}
