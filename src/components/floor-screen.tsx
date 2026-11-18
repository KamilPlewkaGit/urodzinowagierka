"use client";

import { useEffect, useMemo, useState } from "react";
import { formatChips } from "@/lib/chips";
import { getTeam } from "@/lib/constants";
import { THE_FLOOR_BET_STAKE, THE_FLOOR_TITLE, getTheFloorCategory, getTheFloorItem, getTheFloorTimes } from "@/lib/floor";
import type { GameSnapshot, TeamId, TeamMeta } from "@/lib/types";

interface FloorScreenProps {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerRole: "player" | "admin";
  viewerPlayerId?: number;
}

interface TeamDuelistsProps {
  teamA: TeamMeta;
  teamB: TeamMeta;
  activeTeamId?: TeamId | null;
  teamATimeSeconds?: number;
  teamBTimeSeconds?: number;
}

type ApiError = { error?: string };

function TeamDuelists({ teamA, teamB, activeTeamId = null, teamATimeSeconds, teamBTimeSeconds }: TeamDuelistsProps) {
  return (
    <div className="floor-duelists" aria-label={`${teamA.name} kontra ${teamB.name}`}>
      <strong className={activeTeamId === teamA.id ? "is-active" : ""} style={{ color: teamA.color, borderColor: teamA.color }}>
        {teamA.icon} {teamA.name}{teamATimeSeconds !== undefined ? <small>{teamATimeSeconds} s</small> : null}
      </strong>
      <span>VS</span>
      <strong className={activeTeamId === teamB.id ? "is-active" : ""} style={{ color: teamB.color, borderColor: teamB.color }}>
        {teamB.icon} {teamB.name}{teamBTimeSeconds !== undefined ? <small>{teamBTimeSeconds} s</small> : null}
      </strong>
    </div>
  );
}

export function FloorScreen({ snapshot, refresh, viewerRole, viewerPlayerId }: FloorScreenProps) {
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState("");
  const [betting, setBetting] = useState(false);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

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
  const category = duel ? getTheFloorCategory(duel.categoryId) : null;
  const item = duel ? getTheFloorItem(duel.categoryId, duel.itemIndex) : null;
  const teamA = duel?.teamAId ? getTeam(duel.teamAId) : null;
  const teamB = duel?.teamBId ? getTeam(duel.teamBId) : null;
  const winnerTeam = duel?.winnerTeamId ? getTeam(duel.winnerTeamId) : null;
  const viewerTeamId = viewerPlayerId === undefined ? null : snapshot.players.find((player) => player.id === viewerPlayerId)?.teamId ?? null;
  const viewerIsCompeting = viewerTeamId !== null && duel !== null && (viewerTeamId === duel.teamAId || viewerTeamId === duel.teamBId);
  const times = useMemo(() => duel ? getTheFloorTimes(duel, now) : null, [duel, now]);

  return (
    <>
      <section className="game-stage floor-stage">
        <div className="game-stage-content">
          {floor.stage === "intro" ? <>
            <span className="eyebrow">Kolejny segment</span><h1>{THE_FLOOR_TITLE}</h1>
            <p>W każdym pojedynku rywalizują dwie drużyny. Członkowie pozostałych drużyn obstawiają zwycięzcę.</p>
            <div className="segment-rules"><span><strong>Tryb:</strong> drużyna kontra drużyna</span><span><strong>Format:</strong> jeden pojedynek na kategorię</span><span><strong>Zakłady:</strong> 2 żetony na drużynę</span></div>
          </> : null}

          {floor.stage === "setup" && category ? <>
            <span className="eyebrow">Pojedynek {duel ? duel.sequence + 1 : 1}/6 · wybór drużyn</span><h1>{category.name}</h1>
            <p>{category.instructions}</p><p className="floor-waiting">Prowadzący wybiera teraz dwie rywalizujące drużyny.</p>
          </> : null}

          {floor.stage === "betting" && duel && category && teamA && teamB ? <>
            <span className="eyebrow">Pojedynek {duel.sequence + 1}/6 · obstawianie trwa</span><h1>{category.name}</h1>
            <p>{category.instructions}</p>
            <TeamDuelists teamA={teamA} teamB={teamB} />
            {viewerRole === "player" && viewerTeamId && !viewerIsCompeting && !duel.viewerBetTargetTeamId ? <div className="floor-bet-panel"><p>Wybierz zwycięską drużynę. Stawka: <strong>{formatChips(THE_FLOOR_BET_STAKE)} żetony</strong>.</p><div className="floor-bet-buttons"><button className="gold-button" disabled={betting} onClick={() => placeBet(teamA.id)}>Stawiam na {teamA.name}</button><button className="gold-button" disabled={betting} onClick={() => placeBet(teamB.id)}>Stawiam na {teamB.name}</button></div></div> : null}
            {viewerRole === "player" && viewerIsCompeting ? <p className="floor-waiting">Twoja drużyna bierze udział w pojedynku, więc jej członkowie nie mogą obstawiać.</p> : null}
            {viewerRole === "player" && duel.viewerBetTargetTeamId ? <p className="floor-waiting">Twój zakład na {getTeam(duel.viewerBetTargetTeamId).name} został przyjęty. Prowadzący zamknie zakłady przed startem.</p> : null}
          </> : null}

          {floor.stage === "live" && duel && category && item && teamA && teamB && times ? <>
            <span className="eyebrow">Pojedynek {duel.sequence + 1}/6 · w toku · zakłady zamknięte</span>
            <h1 className="floor-category-title">{category.name}</h1><p>{category.instructions}</p>
            <TeamDuelists teamA={teamA} teamB={teamB} activeTeamId={duel.activeTeamId} teamATimeSeconds={times.teamA} teamBTimeSeconds={times.teamB} />
            <p className="floor-active-player">Teraz odpowiada: <strong>{duel.activeTeamId ? getTeam(duel.activeTeamId).name : "—"}</strong></p>
            <img className="floor-prompt-image" src={item.imageUrl} onError={(event) => { if (item.fallbackImageUrl) { event.currentTarget.onerror = null; event.currentTarget.src = item.fallbackImageUrl; } }} alt={`Grafika kategorii ${category.name}, pozycja ${duel.itemIndex + 1}`} />
          </> : null}

          {floor.stage === "result" && duel ? <>
            <span className="eyebrow">Wynik pojedynku {duel.sequence + 1}/6</span>
            {winnerTeam ? <><h1>Wygrywa <em>{winnerTeam.name}</em>.</h1><p>Zakłady zostały rozliczone z puli tego pojedynku. Prowadzący przygotuje kolejny pojedynek.</p></> : <><h1>Pojedynek dobiegł <em>końca.</em></h1><p>Prowadzący wybiera i zatwierdza zwycięską drużynę.</p></>}
            {viewerRole === "player" && duel.viewerBetResult ? <p className="floor-waiting">{duel.viewerBetResult === "won" ? `Twój zakład wygrał. Otrzymujesz ${formatChips(duel.viewerBetPayout ?? "0")} żetonów z puli.` : duel.viewerBetResult === "refunded" ? `Nikt nie obstawił zwycięzcy — Twoja stawka ${formatChips(duel.viewerBetPayout ?? "0")} żetonów została zwrócona.` : "Twój zakład nie wygrał."}</p> : null}
          </> : null}

          {floor.stage === "results" ? <>
            <span className="eyebrow">The Floor · zakończono</span><h1>To już <em>koniec.</em></h1>
            <p>Wszystkie dostępne pojedynki drużynowe w segmencie zostały rozegrane.</p>
          </> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
        </div>
      </section>
    </>
  );
}
