"use client";

import { type CSSProperties, useState } from "react";

import { TEAMS, getTeam } from "@/lib/constants";
import { POJEDYNKI_DUEL_COUNT, POJEDYNKI_TITLE, getPojedynkiDuelLabel } from "@/lib/pojedynki";
import type { GameSnapshot, TeamId, TeamMeta } from "@/lib/types";

interface PojedynkiAdminControlsProps {
  snapshot: GameSnapshot;
  onRefresh: () => Promise<void>;
}

type ApiError = { error?: string };

function teamStyle(team: TeamMeta) {
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

function TeamChoice({ team, selected, onSelect, disabled = false }: { team: TeamMeta; selected: boolean; onSelect: () => void; disabled?: boolean }) {
  return <button type="button" className={`team-choice${selected ? " is-selected" : ""}`} style={teamStyle(team)} onClick={onSelect} disabled={disabled} aria-pressed={selected}><span className="team-icon">{team.icon}</span><span className="team-choice-copy"><strong>{team.name}</strong><small>{team.tagline}</small></span><span className="team-check">{selected ? "✓" : ""}</span></button>;
}

function Versus({ teamAId, teamBId }: { teamAId: TeamId; teamBId: TeamId }) {
  const teamA = getTeam(teamAId);
  const teamB = getTeam(teamBId);
  return <div className="floor-duelists" aria-label={`${teamA.name} kontra ${teamB.name}`}><strong style={{ color: teamA.color, borderColor: teamA.color }}>{teamA.icon} {teamA.name}</strong><span>VS</span><strong style={{ color: teamB.color, borderColor: teamB.color }}>{teamB.icon} {teamB.name}</strong></div>;
}

export function PojedynkiAdminControls({ snapshot, onRefresh }: PojedynkiAdminControlsProps) {
  const [teamAId, setTeamAId] = useState<TeamId | null>(null);
  const [teamBId, setTeamBId] = useState<TeamId | null>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const pojedynki = snapshot.pojedynki;
  const duel = pojedynki.currentDuel;
  const winner = duel?.winnerTeamId ? getTeam(duel.winnerTeamId) : null;

  function confirmStart() {
    if (window.confirm("Zamknąć obstawianie i rozpocząć pojedynek? Złożone zakłady zostaną rozliczone po wyniku.")) {
      void post("start-duel", "/api/segment/pojedynki/start-duel");
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
    if (await post("configure", "/api/segment/pojedynki/configure", { teamAId, teamBId })) { setTeamAId(null); setTeamBId(null); }
  }

  async function confirmWinner() {
    if (!winnerTeamId) return;
    if (await post("finish", "/api/segment/pojedynki/finish", { winnerTeamId })) setWinnerTeamId(null);
  }

  async function next() {
    if (await post("next", "/api/segment/pojedynki/next")) { setTeamAId(null); setTeamBId(null); setWinnerTeamId(null); }
  }

  return <section className="floor-admin-section" aria-label="Sterowanie segmentem Pojedynki">
    <div className="section-heading"><div><span className="eyebrow">Pojedynki</span><h2>Sterowanie rywalizacją drużyn</h2></div><span className="poll-note">Stan zapisuje się automatycznie</span></div>
    <article className="floor-admin-panel">
      {pojedynki.stage === "intro" ? <><span className="panel-index">POJEDYNKI / START</span><h2>{POJEDYNKI_TITLE}</h2><p>Segment zawiera cztery pojedynki. Przed każdym wybierasz dwie drużyny, a gracze z pozostałych drużyn mogą obstawić za 2 żetony.</p><button className="gold-button start-button" type="button" onClick={() => post("start", "/api/segment/pojedynki/start")} disabled={pending !== null}>{pending === "start" ? "Rozpoczynanie segmentu…" : "Rozpocznij segment"}</button></> : null}
      {pojedynki.stage === "setup" && duel ? <><span className="panel-index">{getPojedynkiDuelLabel(duel.sequence)} / WYBÓR DRUŻYN</span><h2>Wybierz rywalizujące drużyny</h2><p>Każdy pojedynek ma dwóch różnych uczestników. Żaden indywidualny gracz nie jest wybierany.</p><fieldset className="team-fieldset"><legend>Wybierz pierwszą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamAId === team.id} onSelect={() => { setTeamAId(team.id); if (teamBId === team.id) setTeamBId(null); }} disabled={pending !== null} />)}</div></fieldset><fieldset className="team-fieldset"><legend>Wybierz drugą drużynę</legend><div className="team-grid">{TEAMS.map((team) => <TeamChoice key={team.id} team={team} selected={teamBId === team.id} onSelect={() => setTeamBId(team.id)} disabled={pending !== null || teamAId === team.id} />)}</div></fieldset><button className="gold-button start-button" type="button" onClick={configure} disabled={pending !== null || !teamAId || !teamBId}>Zatwierdź drużyny i rozpocznij obstawianie</button></> : null}
      {pojedynki.stage === "betting" && duel?.teamAId && duel.teamBId ? <><span className="panel-index">{getPojedynkiDuelLabel(duel.sequence)} / OBSTAWIANIE</span><h2>Zakłady są otwarte</h2><Versus teamAId={duel.teamAId} teamBId={duel.teamBId} /><p>Zarejestrowane zakłady: <strong>{duel.betCount}</strong>. Obstawianie jest opcjonalne.</p><button className="gold-button start-button" type="button" onClick={confirmStart} disabled={pending !== null}>{pending === "start-duel" ? "Rozpoczynanie pojedynku…" : "Rozpocznij pojedynek"}</button></> : null}
      {pojedynki.stage === "live" && duel?.teamAId && duel.teamBId ? <><span className="panel-index">{getPojedynkiDuelLabel(duel.sequence)} / W TOKU</span><h2>Pojedynek trwa</h2><Versus teamAId={duel.teamAId} teamBId={duel.teamBId} /><p>Pojedynek odbywa się poza aplikacją. Po jego zakończeniu wybierz zwycięską drużynę i zatwierdź wynik.</p><fieldset className="team-fieldset"><legend>Wybierz zwycięzcę</legend><div className="team-grid"><TeamChoice team={getTeam(duel.teamAId)} selected={winnerTeamId === duel.teamAId} onSelect={() => setWinnerTeamId(duel.teamAId)} disabled={pending !== null} /><TeamChoice team={getTeam(duel.teamBId)} selected={winnerTeamId === duel.teamBId} onSelect={() => setWinnerTeamId(duel.teamBId)} disabled={pending !== null} /></div></fieldset><button className="gold-button start-button" type="button" onClick={confirmWinner} disabled={pending !== null || !winnerTeamId}>{pending === "finish" ? "Zapisywanie wyniku…" : "Zatwierdź wynik"}</button></> : null}
      {pojedynki.stage === "result" && duel && winner ? <><span className="panel-index">{getPojedynkiDuelLabel(duel.sequence)} / WYNIK</span><h2>Wygrywa {winner.name}.</h2><p>Zakłady zostały rozliczone. {duel.sequence + 1 < POJEDYNKI_DUEL_COUNT ? "Możesz przygotować następny pojedynek." : "Wszystkie cztery pojedynki są rozstrzygnięte."}</p><button className="gold-button start-button" type="button" onClick={next} disabled={pending !== null}>{pending === "next" ? "Przechodzenie dalej…" : duel.sequence + 1 < POJEDYNKI_DUEL_COUNT ? "Następny pojedynek" : "Pokaż wyniki"}</button></> : null}
      {pojedynki.stage === "results" ? <><span className="panel-index">POJEDYNKI / WYNIKI</span><h2>Segment zakończony.</h2><div className="segment-rules">{pojedynki.duels.map((completed) => <span key={completed.id}>{getPojedynkiDuelLabel(completed.sequence)}: <strong>{completed.winnerTeamId ? getTeam(completed.winnerTeamId).name : "brak wyniku"}</strong></span>)}</div><button className="gold-button start-button" type="button" onClick={() => post("complete", "/api/segment/pojedynki/complete")} disabled={pending !== null}>{pending === "complete" ? "Zapisywanie…" : "Zakończ segment"}</button></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </article>
  </section>;
}
