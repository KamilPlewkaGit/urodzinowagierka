"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { TEAMS, getTeam } from "@/lib/constants";
import { THE_FLOOR_TITLE, getTheFloorCategory, getTheFloorItem, getTheFloorTimes } from "@/lib/floor";
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

function TeamDuelists({ teamA, teamB, activeTeamId, teamATimeSeconds, teamBTimeSeconds }: { teamA: TeamMeta; teamB: TeamMeta; activeTeamId?: TeamId | null; teamATimeSeconds?: number; teamBTimeSeconds?: number }) {
  return (
    <div className="floor-duelists" aria-label={`${teamA.name} kontra ${teamB.name}`}>
      <strong className={activeTeamId === teamA.id ? "is-active" : ""} style={{ color: teamA.color, borderColor: teamA.color }}>{teamA.icon} {teamA.name}{teamATimeSeconds !== undefined ? <small>{teamATimeSeconds} s</small> : null}</strong>
      <span>VS</span>
      <strong className={activeTeamId === teamB.id ? "is-active" : ""} style={{ color: teamB.color, borderColor: teamB.color }}>{teamB.icon} {teamB.name}{teamBTimeSeconds !== undefined ? <small>{teamBTimeSeconds} s</small> : null}</strong>
    </div>
  );
}

export function FloorAdminControls({ snapshot, onRefresh }: FloorAdminControlsProps) {
  const [teamAId, setTeamAId] = useState<TeamId | null>(null);
  const [teamBId, setTeamBId] = useState<TeamId | null>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const floor = snapshot.theFloor;
  const duel = floor.currentDuel;
  const category = duel ? getTheFloorCategory(duel.categoryId) : null;
  const item = duel ? getTheFloorItem(duel.categoryId, duel.itemIndex) : null;
  const teamA = duel?.teamAId ? getTeam(duel.teamAId) : null;
  const teamB = duel?.teamBId ? getTeam(duel.teamBId) : null;
  const winnerTeam = duel?.winnerTeamId ? getTeam(duel.winnerTeamId) : null;
  const times = useMemo(() => duel ? getTheFloorTimes(duel, now) : null, [duel, now]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (floor.stage !== "live" || !times || (times.teamA > 0 && times.teamB > 0) || pending === "timeout") return;
    void post("timeout", "/api/segment/floor/timeout");
  // post is intentionally recreated with the state it closes over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floor.stage, times?.teamA, times?.teamB]);

  function confirmStart() {
    if (window.confirm("Zamknąć obstawianie i rozpocząć pojedynek? Złożone zakłady zostaną rozliczone po wyniku.")) {
      void post("start-duel", "/api/segment/floor/start-duel");
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
    if (!winnerTeamId) return;
    const done = await post("end", "/api/segment/floor/end", { winnerTeamId });
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
        {floor.stage === "intro" ? <>
          <span className="panel-index">THE FLOOR / START</span><h2>{THE_FLOOR_TITLE}</h2>
          <p>W każdym pojedynku rywalizują całe drużyny. Członkowie dwóch pozostałych drużyn mogą obstawić zwycięzcę za 2 żetony.</p>
          <button className="gold-button start-button" onClick={() => post("start", "/api/segment/floor/start")} disabled={pending !== null}>Rozpocznij segment</button>
        </> : null}

        {floor.stage === "setup" && duel && category ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/6 / WYBÓR DRUŻYN</span><h2>{category.name}</h2><p>{category.instructions}</p>
          <fieldset className="team-fieldset"><legend>Wybierz pierwszą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamAId === team.id} onSelect={() => { setTeamAId(team.id); if (teamBId === team.id) setTeamBId(null); }} disabled={pending !== null} />)}</div></fieldset>
          <fieldset className="team-fieldset"><legend>Wybierz drugą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamBId === team.id} onSelect={() => setTeamBId(team.id)} disabled={pending !== null || teamAId === team.id} />)}</div></fieldset>
          <button className="gold-button start-button" onClick={configure} disabled={pending !== null || !teamAId || !teamBId}>Zatwierdź drużyny i rozpocznij obstawianie</button>
        </> : null}

        {floor.stage === "betting" && duel && category && teamA && teamB ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/6 / OBSTAWIANIE</span><h2>{category.name}</h2><p>{category.instructions}</p>
          <TeamDuelists teamA={teamA} teamB={teamB} />
          <p>Zarejestrowane zakłady: <strong>{duel.betCount}</strong>. Obstawianie jest opcjonalne.</p>
          <button className="gold-button start-button" onClick={confirmStart} disabled={pending !== null}>Rozpocznij pojedynek</button>
        </> : null}

        {floor.stage === "live" && duel && category && item && teamA && teamB && times ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/6 / W TOKU / GRAFIKA {duel.itemIndex + 1}/50</span><h2>{category.name}</h2>
          <TeamDuelists teamA={teamA} teamB={teamB} activeTeamId={duel.activeTeamId} teamATimeSeconds={times.teamA} teamBTimeSeconds={times.teamB} />
          <p>Aktywna drużyna: <strong>{duel.activeTeamId ? getTeam(duel.activeTeamId).name : "—"}</strong>. „Poprawnie” przełącza turę między drużynami, a „Pomiń” odejmuje 3 sekundy aktywnej drużynie.</p>
          <img className="floor-prompt-image floor-admin-image" src={item.imageUrl} onError={(event) => { if (item.fallbackImageUrl) { event.currentTarget.onerror = null; event.currentTarget.src = item.fallbackImageUrl; } }} alt={`Grafika ${duel.itemIndex + 1} kategorii ${category.name}`} />
          <div className="floor-admin-actions"><button className="gold-button" onClick={() => post("correct", "/api/segment/floor/advance", { action: "correct" })} disabled={pending !== null}>Poprawnie</button><button className="secondary-button" onClick={() => post("pass", "/api/segment/floor/advance", { action: "pass" })} disabled={pending !== null}>Pomiń (−3 s)</button></div>
        </> : null}

        {floor.stage === "result" && duel && teamA && teamB && !winnerTeam ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/6 / WYBÓR ZWYCIĘZCY</span><h2>Wybierz zwycięzcę</h2><p>Pojedynek jest zakończony, a zakłady oczekują na potwierdzenie wyniku.</p>
          <TeamDuelists teamA={teamA} teamB={teamB} />
          <fieldset className="team-fieldset"><legend>Wybierz zwycięską drużynę</legend><div className="team-grid"><TeamChoice team={teamA} selected={winnerTeamId === teamA.id} onSelect={() => setWinnerTeamId(teamA.id)} disabled={pending !== null} /><TeamChoice team={teamB} selected={winnerTeamId === teamB.id} onSelect={() => setWinnerTeamId(teamB.id)} disabled={pending !== null} /></div></fieldset>
          <button className="gold-button start-button" onClick={confirmWinner} disabled={pending !== null || !winnerTeamId}>Zatwierdź wynik</button>
        </> : null}

        {floor.stage === "result" && duel && winnerTeam ? <>
          <span className="panel-index">POJEDYNEK {duel.sequence + 1}/6 / WYNIK</span><h2>Wygrywa {winnerTeam.name}.</h2><p>Zakłady zostały rozliczone z zamkniętej puli. Możesz teraz przygotować kolejny pojedynek.</p>
          <button className="gold-button start-button" onClick={moveToNextDuel} disabled={pending !== null}>{duel.sequence === 5 ? "Pokaż podsumowanie segmentu" : "Następny pojedynek"}</button>
        </> : null}

        {floor.stage === "results" ? <><span className="panel-index">THE FLOOR / WYNIKI</span><h2>Segment zakończony.</h2><p>Rozegrano wszystkie przygotowane pojedynki drużynowe.</p></> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </article>
    </section>
  );
}
