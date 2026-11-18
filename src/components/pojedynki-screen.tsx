"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { CasinoLogo } from "@/components/casino-logo";
import { formatChips } from "@/lib/chips";
import { POLL_INTERVAL_MS, TEAMS, getTeam } from "@/lib/constants";
import { POJEDYNKI_BET_STAKE, POJEDYNKI_DUEL_COUNT, POJEDYNKI_TITLE, getPojedynkiDuelLabel } from "@/lib/pojedynki";
import type { GameSnapshot, PojedynkiDuel, TeamId } from "@/lib/types";

interface PojedynkiScreenProps {
  initialSnapshot: GameSnapshot;
  viewerRole: "player" | "admin";
  viewerPlayerId?: number;
}

type ApiError = { error?: string };

function Versus({ duel }: { duel: PojedynkiDuel }) {
  const teamA = duel.teamAId ? getTeam(duel.teamAId) : null;
  const teamB = duel.teamBId ? getTeam(duel.teamBId) : null;
  if (!teamA || !teamB) return null;
  return <div className="floor-duelists" aria-label={`${teamA.name} kontra ${teamB.name}`}><strong style={{ color: teamA.color, borderColor: teamA.color }}>{teamA.icon} {teamA.name}</strong><span>VS</span><strong style={{ color: teamB.color, borderColor: teamB.color }}>{teamB.icon} {teamB.name}</strong></div>;
}

export function PojedynkiScreen({ initialSnapshot, viewerRole, viewerPlayerId }: PojedynkiScreenProps) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [betting, setBetting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/game/state", { cache: "no-store" });
      if (response.status === 401) { router.replace("/"); router.refresh(); return; }
      if (!response.ok) throw new Error();
      const next = (await response.json()) as GameSnapshot;
      setSnapshot(next);
      if (next.game.activeSegment !== "pojedynki") { router.refresh(); return; }
      if (next.game.status === "waiting") { router.replace(viewerRole === "admin" ? "/admin" : "/lobby"); router.refresh(); }
    } catch {
      setError("Połączenie z grą jest chwilowo niedostępne.");
    }
  }, [router, viewerRole]);

  useEffect(() => {
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function placeBet(targetTeamId: TeamId) {
    setError("");
    setBetting(true);
    try {
      const response = await fetch("/api/segment/pojedynki/bet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetTeamId }) });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) setError(payload?.error ?? "Nie udało się postawić zakładu.");
      else await refresh();
    } catch {
      setError("Nie udało się połączyć z usługą zakładów.");
    } finally {
      setBetting(false);
    }
  }

  async function leave() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const pojedynki = snapshot.pojedynki;
  const duel = pojedynki.currentDuel;
  const viewer = viewerPlayerId === undefined ? null : snapshot.players.find((player) => player.id === viewerPlayerId) ?? null;
  const viewerCompetes = viewer && duel && (viewer.teamId === duel.teamAId || viewer.teamId === duel.teamBId);
  const winner = duel?.winnerTeamId ? getTeam(duel.winnerTeamId) : null;

  return <main className="app-shell game-shell floor-shell">
    <header className="topbar"><CasinoLogo /><div className="topbar-actions"><span className="sync-indicator"><i /> Segment na żywo</span>{viewer ? <span className="sync-indicator">Żetony: {formatChips(viewer.tokens)}</span> : null}{viewerRole === "admin" ? <button className="quiet-button" onClick={() => router.push("/admin")}>Panel prowadzącego</button> : null}<button className="quiet-button" onClick={leave}>Wyjdź</button></div></header>
    <section className="game-stage floor-stage"><div className="game-stage-content">
      {pojedynki.stage === "intro" ? <><span className="eyebrow">Szósty segment</span><h1>POJEDYNKI</h1><p>Cztery drużynowe rywalizacje odbywają się kolejno poza aplikacją.</p><div className="floor-duelists" aria-label="Wszystkie drużyny">{TEAMS.map((team) => <strong key={team.id} style={{ color: team.color, borderColor: team.color }}>{team.icon} {team.name}</strong>)}</div><div className="segment-rules"><span><strong>Liczba pojedynków:</strong> 4</span><span><strong>Uczestnicy:</strong> dwie drużyny w każdym pojedynku</span><span><strong>Wybór uczestników:</strong> organizator wybiera drużyny</span><span><strong>Obstawianie:</strong> pozostałe drużyny obstawiają zwycięzcę</span><span><strong>Stawka:</strong> 2 żetony</span><span><strong>Zwycięzca:</strong> wybierany przez administratora</span></div></> : null}
      {pojedynki.stage === "setup" && duel ? <><span className="eyebrow">{getPojedynkiDuelLabel(duel.sequence)} · wybór drużyn</span><h1>Przygotowanie <em>pojedynku.</em></h1><p>Prowadzący wybiera dwie rywalizujące drużyny. Po zatwierdzeniu pozostali aktywni gracze obstawią wynik.</p></> : null}
      {pojedynki.stage === "betting" && duel && duel.teamAId && duel.teamBId ? <><span className="eyebrow">{getPojedynkiDuelLabel(duel.sequence)} · obstawianie trwa</span><h1>Wybierz <em>zwycięzcę.</em></h1><Versus duel={duel} />{viewerRole === "player" && viewer && !viewerCompetes && !duel.viewerBetTargetTeamId ? <div className="floor-bet-panel"><p>Postaw obowiązkowy zakład o stawce <strong>{formatChips(POJEDYNKI_BET_STAKE)} żetony</strong>.</p><div className="floor-bet-buttons"><button className="gold-button" disabled={betting} onClick={() => placeBet(duel.teamAId!)}>Stawiam na {getTeam(duel.teamAId!).name}</button><button className="gold-button" disabled={betting} onClick={() => placeBet(duel.teamBId!)}>Stawiam na {getTeam(duel.teamBId!).name}</button></div></div> : null}{viewerRole === "player" && viewerCompetes ? <p className="floor-waiting">Twoja drużyna bierze udział w pojedynku, więc nie możesz obstawiać.</p> : null}{viewerRole === "player" && duel.viewerBetTargetTeamId ? <p className="floor-waiting">Twój zakład na <strong>{getTeam(duel.viewerBetTargetTeamId).name}</strong> został przyjęty.</p> : null}</> : null}
      {pojedynki.stage === "live" && duel ? <><span className="eyebrow">{getPojedynkiDuelLabel(duel.sequence)} · trwa · zakłady zamknięte</span><h1>Drużyny <em>rywalizują.</em></h1><Versus duel={duel} /><p className="floor-waiting">Pojedynek odbywa się poza aplikacją. Prowadzący zatwierdzi zwycięzcę po jego zakończeniu.</p></> : null}
      {pojedynki.stage === "result" && duel ? <><span className="eyebrow">{getPojedynkiDuelLabel(duel.sequence)} · wynik</span><h1>Wygrywa <em>{winner?.name ?? "wybrana drużyna"}</em>.</h1><Versus duel={duel} /><p>Zakłady zostały rozliczone z zamkniętej puli, a salda graczy zostały zaktualizowane.</p>{viewerRole === "player" && duel.viewerBetResult ? <p className="floor-waiting">{duel.viewerBetResult === "won" ? `Twój zakład wygrał. Wypłata: ${formatChips(duel.viewerBetPayout ?? "0")} żetonów.` : duel.viewerBetResult === "refunded" ? `Zakład został zwrócony: ${formatChips(duel.viewerBetPayout ?? "0")} żetonów.` : "Twój zakład nie wygrał."}</p> : null}</> : null}
      {pojedynki.stage === "results" ? <><span className="eyebrow">Pojedynki · zakończono</span><h1>Cztery pojedynki <em>rozstrzygnięte.</em></h1><div className="segment-rules">{pojedynki.duels.map((completed) => <span key={completed.id}>{getPojedynkiDuelLabel(completed.sequence)}: <strong>{completed.winnerTeamId ? getTeam(completed.winnerTeamId).name : "brak wyniku"}</strong></span>)}</div></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div></section>
  </main>;
}
