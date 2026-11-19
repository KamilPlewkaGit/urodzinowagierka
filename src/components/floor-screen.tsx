"use client";

import { useState } from "react";
import { FloorDuelists, useFloorTimes } from "@/components/floor-clock";
import { FloorPrompt } from "@/components/floor-prompt";
import { formatChips } from "@/lib/chips";
import { getSegmentNumber, getTeam } from "@/lib/constants";
import { THE_FLOOR_BET_STAKE, THE_FLOOR_BET_DESCRIPTION, THE_FLOOR_TITLE } from "@/lib/floor";
import type { GameSnapshot, TeamId } from "@/lib/types";

interface FloorScreenProps {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerRole: "player" | "admin";
  viewerPlayerId?: number;
}

type ApiError = { error?: string };

export function FloorScreen({ snapshot, refresh, viewerRole, viewerPlayerId }: FloorScreenProps) {
  const [error, setError] = useState("");
  const [betting, setBetting] = useState(false);

  async function placeBet(targetTeamId: TeamId) {
    setError("");
    setBetting(true);
    try {
      const response = await fetch("/api/segment/floor/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetTeamId }),
      });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) setError(payload?.error ?? "Nie udało się postawić zakładu.");
      else await refresh();
    } catch {
      setError("Nie udało się połączyć z usługą zakładów.");
    } finally {
      setBetting(false);
    }
  }

  const floor = snapshot.theFloor;
  const duel = floor.currentDuel;
  const category = floor.content;
  const teamA = duel?.teamAId ? getTeam(duel.teamAId) : null;
  const teamB = duel?.teamBId ? getTeam(duel.teamBId) : null;
  const winnerTeam = duel?.settledAt && duel.winnerTeamId ? getTeam(duel.winnerTeamId) : null;
  const viewerTeamId = viewerPlayerId === undefined ? null : snapshot.players.find((player) => player.id === viewerPlayerId)?.teamId ?? null;
  const viewerIsCompeting = viewerTeamId !== null && duel !== null && (viewerTeamId === duel.teamAId || viewerTeamId === duel.teamBId);
  const times = useFloorTimes(duel, floor.serverTime);

  return (
    <>
      <section className="game-stage floor-stage">
        <div className="game-stage-content">
          {floor.stage === "intro" ? <>
            <span className="eyebrow">{getSegmentNumber(snapshot.game.activeSegment)}</span><h1>{THE_FLOOR_TITLE}</h1>
            <p>{THE_FLOOR_BET_DESCRIPTION}</p>
            <div className="segment-rules"><span><strong>Tryb:</strong> drużyna kontra drużyna</span><span><strong>Format:</strong> jeden pojedynek na kategorię</span></div>
          </> : null}

          {floor.stage === "setup" && category ? <>
            <span className="eyebrow">Pojedynek {duel ? duel.sequence + 1 : 1}/{floor.duels.length} · wybór drużyn</span><h1>{category.name}</h1>
            <p>{category.instructions}</p><p className="floor-waiting">Prowadzący wybiera teraz dwie rywalizujące drużyny.</p>
          </> : null}

          {floor.stage === "betting" && duel && category && teamA && teamB ? <>
            <span className="eyebrow">Pojedynek {duel.sequence + 1}/{floor.duels.length} · obstawianie trwa</span><h1>{category.name}</h1>
            <p>{category.instructions}</p>
            <FloorDuelists teamA={teamA} teamB={teamB} />
            {viewerRole === "player" && viewerTeamId && !viewerIsCompeting && !duel.viewerBetTargetTeamId ? <div className="floor-bet-panel"><p>Zakład jest opcjonalny. Poczekaj na start albo wybierz drużynę. Stawka: <strong>{formatChips(THE_FLOOR_BET_STAKE)} żetony</strong>.</p><div className="floor-bet-buttons"><button className="gold-button" disabled={betting} onClick={() => placeBet(teamA.id)}>Stawiam na {teamA.name}</button><button className="gold-button" disabled={betting} onClick={() => placeBet(teamB.id)}>Stawiam na {teamB.name}</button></div></div> : null}
            {viewerRole === "player" && viewerIsCompeting ? <p className="floor-waiting">Twoja drużyna bierze udział w pojedynku, więc jej członkowie nie mogą obstawiać.</p> : null}
            {viewerRole === "player" && duel.viewerBetTargetTeamId ? <p className="floor-waiting">Twój zakład na {getTeam(duel.viewerBetTargetTeamId).name} został przyjęty. Prowadzący zamknie zakłady przed startem.</p> : null}
          </> : null}

          {floor.stage === "live" && duel && category && teamA && teamB && times ? <>
            <span className="eyebrow">Pojedynek {duel.sequence + 1}/{floor.duels.length} · w toku · zakłady zamknięte</span>
            <h1 className="floor-category-title">{category.name}</h1><p>{category.instructions}</p>
            <FloorDuelists teamA={teamA} teamB={teamB} activeTeamId={duel.activeTeamId} times={times} />
            <FloorPrompt key={`${duel.id}:${duel.itemIndex}`} prompt={category.prompt} alt={`Grafika kategorii ${category.name}, pozycja ${duel.itemIndex + 1}`} />
          </> : null}

          {floor.stage === "result" && duel ? <>
            <span className="eyebrow">Wynik pojedynku {duel.sequence + 1}/{floor.duels.length}</span>
            {winnerTeam ? <><h1>Wygrywa <em>{winnerTeam.name}</em>.</h1><p>Zakłady zostały rozliczone. Prowadzący przygotuje kolejny pojedynek.</p></> : <><h1>Pojedynek dobiegł <em>końca.</em></h1><p>Prowadzący wybiera i zatwierdza zwycięską drużynę.</p></>}
            {viewerRole === "player" && duel.viewerBetResult && duel.viewerBetResult !== "pending" ? <p className="floor-waiting">{duel.viewerBetResult === "won" ? `Twój zakład wygrał. Otrzymujesz ${formatChips(duel.viewerBetPayout ?? "0")} żetonów.` : duel.viewerBetResult === "refunded" ? `Twoja stawka ${formatChips(duel.viewerBetPayout ?? "0")} żetonów została zwrócona.` : "Twój zakład nie wygrał."}</p> : null}
          </> : null}

          {floor.stage === "results" ? <>
            <span className="eyebrow">The Floor · zakończono</span><h1>To już <em>koniec.</em></h1>
            <p>Wszystkie dostępne pojedynki drużynowe w segmencie zostały rozegrane.</p>
          </> : null}
          {category?.categoryError && floor.stage !== "result" ? <p className="form-error" role="alert">{category.name} – {category.categoryError}</p> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      </section>
    </>
  );
}
