"use client";

import { type CSSProperties, useEffect, useState } from "react";

import { FloorDuelists, useFloorTimes } from "@/components/floor-clock";
import { FloorPreloadProgress, useFloorPreload } from "@/components/floor-preload";
import { FloorPrompt } from "@/components/floor-prompt";
import { TEAMS, getTeam } from "@/lib/constants";
import { THE_FLOOR_BET_DESCRIPTION, THE_FLOOR_TITLE } from "@/lib/floor";
import type { GameSnapshot, TeamId, TeamMeta } from "@/lib/types";

interface FloorAdminControlsProps {
  snapshot: GameSnapshot;
  onRefresh: () => Promise<void>;
}

interface TeamChoiceProps {
  team: TeamMeta;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
}

type ApiError = { error?: string };

function teamStyle(team: TeamMeta) {
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

function TeamChoice({ team, selected, onSelect, disabled = false }: TeamChoiceProps) {
  return (
    <button type="button" className={`team-choice${selected ? " is-selected" : ""}`} style={teamStyle(team)} onClick={onSelect} disabled={disabled} aria-pressed={selected}>
      <span className="team-icon">{team.icon}</span><span className="team-choice-copy"><strong>{team.name}</strong><small>{team.tagline}</small></span><span className="team-check">{selected ? "✓" : ""}</span>
    </button>
  );
}

export function FloorAdminControls({ snapshot, onRefresh }: FloorAdminControlsProps) {
  const [teamAId, setTeamAId] = useState<TeamId | null>(null);
  const [teamBId, setTeamBId] = useState<TeamId | null>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const floor = snapshot.theFloor;
  const duel = floor.currentDuel;
  const preload = useFloorPreload(floor.stage !== "results", true);
  const category = floor.content;
  const teamA = duel?.teamAId ? getTeam(duel.teamAId) : null;
  const teamB = duel?.teamBId ? getTeam(duel.teamBId) : null;
  const winnerTeam = duel?.settledAt && duel.winnerTeamId ? getTeam(duel.winnerTeamId) : null;
  const selectedWinner = duel?.winnerTeamId ?? winnerTeamId;
  const times = useFloorTimes(duel, floor.serverTime);

  useEffect(() => {
    if (floor.stage !== "live" || !times || (times.teamA > 0 && times.teamB > 0) || pending === "timeout") return;
    void post("timeout", "/api/segment/floor/timeout");
  // post is intentionally recreated with the state it closes over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.stage, times?.teamA, times?.teamB]);

  function confirmStart() {
    if (preload.ready && preload.deviceId && window.confirm("Zamknąć obstawianie i rozpocząć pojedynek? Złożone zakłady zostaną rozliczone po wyniku.")) {
      void post("start-duel", "/api/segment/floor/start-duel", { deviceId: preload.deviceId });
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

  async function configure() {
    if (!teamAId || !teamBId) return;
    const done = await post("configure", "/api/segment/floor/configure", { teamAId, teamBId });
    if (done) { setTeamAId(null); setTeamBId(null); }
  }

  async function confirmWinner() {
    if (!selectedWinner) return;
    const done = await post("end", "/api/segment/floor/end", { winnerTeamId: selectedWinner });
    if (done) setWinnerTeamId(null);
  }

  async function moveToNextDuel() {
    const done = await post("next", "/api/segment/floor/next");
    if (done) { setTeamAId(null); setTeamBId(null); setWinnerTeamId(null); }
  }

  return (
    <section className="floor-admin-section" aria-label="Sterowanie segmentem The Floor">
      <div className="section-heading"><div><span className="eyebrow">The Floor</span><h2>Sterowanie pojedynkiem drużyn</h2></div><span className="poll-note">Stan zapisuje się automatycznie</span></div>
      <article className="floor-admin-panel">
        {(floor.stage === "intro" || floor.stage === "setup" || floor.stage === "betting") && <FloorPreloadProgress preload={preload} admin />}
        {floor.stage === "intro" ? <>
          <span className="panel-index">THE FLOOR / START</span><h2>{THE_FLOOR_TITLE}</h2>
          <p>{THE_FLOOR_BET_DESCRIPTION}</p>
          <button className="gold-button start-button" onClick={() => post("start", "/api/segment/floor/start")} disabled={pending !== null}>Rozpocznij segment</button>
        </> : null}

        {floor.stage === "setup" && duel && category ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/{floor.duels.length} / WYBÓR DRUŻYN</span><h2>{category.name}</h2><p>{category.instructions}</p>
          <fieldset className="team-fieldset"><legend>Wybierz pierwszą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamAId === team.id} onSelect={() => { setTeamAId(team.id); if (teamBId === team.id) setTeamBId(null); }} disabled={pending !== null} />)}</div></fieldset>
          <fieldset className="team-fieldset"><legend>Wybierz drugą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamBId === team.id} onSelect={() => setTeamBId(team.id)} disabled={pending !== null || teamAId === team.id} />)}</div></fieldset>
          <button className="gold-button start-button" onClick={configure} disabled={pending !== null || !teamAId || !teamBId}>Zatwierdź drużyny i rozpocznij obstawianie</button>
        </> : null}

        {floor.stage === "betting" && duel && category && teamA && teamB ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/{floor.duels.length} / OBSTAWIANIE</span><h2>{category.name}</h2><p>{category.instructions}</p>
          <FloorDuelists teamA={teamA} teamB={teamB} />
          <p>Zarejestrowane zakłady: <strong>{duel.betCount}</strong>. Obstawianie jest opcjonalne.</p>
          <button className="gold-button start-button" onClick={confirmStart} disabled={pending !== null || !preload.ready}>Rozpocznij pojedynek</button>
        </> : null}

        {floor.stage === "live" && duel && category && teamA && teamB && times ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/{floor.duels.length} / W TOKU{category.itemCount ? ` / POZYCJA ${duel.itemIndex + 1}/${category.itemCount}` : ""}</span><h2>{category.name}</h2>
          <FloorDuelists teamA={teamA} teamB={teamB} activeTeamId={duel.activeTeamId} times={times} />
          <p>Aktywna drużyna: <strong>{duel.activeTeamId ? getTeam(duel.activeTeamId).name : "—"}</strong>. „Poprawna odpowiedź” przełącza turę między drużynami, a „Pas” odejmuje 3 sekundy aktywnej drużynie.</p>
          <FloorPrompt key={`${duel.id}:${duel.itemIndex}`} prompt={category.prompt} alt={`Grafika kategorii ${category.name}, pozycja ${duel.itemIndex + 1}`} admin />
          {category.adminAnswer ? <p className="floor-admin-answer">Poprawna odpowiedź: <strong>{category.adminAnswer}</strong></p> : <p className="form-error" role="alert">Nie można odczytać poprawnej odpowiedzi dla tej pozycji. Sprawdź plik JSON.</p>}
          <div className="floor-admin-actions"><button className="gold-button" onClick={() => post("correct", "/api/segment/floor/advance", { action: "correct" })} disabled={pending !== null}>Poprawna odpowiedź</button><button className="secondary-button" onClick={() => post("pass", "/api/segment/floor/advance", { action: "pass" })} disabled={pending !== null}>Pas (−3 s)</button></div>
        </> : null}

        {floor.stage === "result" && duel && teamA && teamB && !winnerTeam ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/{floor.duels.length} / WYBÓR ZWYCIĘZCY</span><h2>Wybierz zwycięzcę</h2><p>Zatwierdzenie wyniku przyzna zwycięskiej drużynie 1 punkt i rozliczy zakłady.</p>
          <FloorDuelists teamA={teamA} teamB={teamB} />
          <fieldset className="team-fieldset"><legend>Wybierz zwycięską drużynę</legend><div className="team-grid"><TeamChoice team={teamA} selected={selectedWinner === teamA.id} onSelect={() => setWinnerTeamId(teamA.id)} disabled={pending !== null || Boolean(duel.winnerTeamId)} /><TeamChoice team={teamB} selected={selectedWinner === teamB.id} onSelect={() => setWinnerTeamId(teamB.id)} disabled={pending !== null || Boolean(duel.winnerTeamId)} /></div></fieldset>
          <button className="gold-button start-button" onClick={confirmWinner} disabled={pending !== null || !selectedWinner}>Zatwierdź wynik</button>
        </> : null}

        {floor.stage === "result" && duel && winnerTeam ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/{floor.duels.length} / WYNIK</span><h2>Wygrywa {winnerTeam.name}.</h2><p>Zakłady zostały rozliczone. Możesz teraz przygotować kolejny pojedynek.</p>
          <button className="gold-button start-button" onClick={moveToNextDuel} disabled={pending !== null}>{duel.sequence === floor.duels.length - 1 ? "Pokaż podsumowanie segmentu" : "Następny pojedynek"}</button>
        </> : null}

        {floor.stage === "results" ? <><span className="panel-index">THE FLOOR / WYNIKI</span><h2>Segment zakończony.</h2><p>Rozegrano wszystkie przygotowane pojedynki drużynowe.</p></> : null}
        {category?.categoryError && floor.stage !== "result" ? <p className="form-error" role="alert">{category.name} – {category.categoryError}</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
