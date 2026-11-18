"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { formatChips } from "@/lib/chips";
import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_SONG_COUNT, MELODIA_TITLE, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, TeamId } from "@/lib/types";

interface MelodiaScreenProps {
  snapshot: GameSnapshot;
  refresh: () => Promise<void>;
  viewerRole: "player" | "admin";
  viewerPlayerId?: number;
}

type ApiError = { error?: string };

function teamStyle(teamId: TeamId) {
  const team = getTeam(teamId);
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

function SegmentScoreboard({ snapshot }: { snapshot: GameSnapshot }) {
  const ranking = useMemo(() => TEAMS.map((team) => ({ team, points: snapshot.melodia.teamScores.find((score) => score.teamId === team.id)?.points ?? 0 }))
    .sort((left, right) => right.points - left.points || left.team.name.localeCompare(right.team.name, "pl")), [snapshot.melodia.teamScores]);

  return <div className="score-grid" aria-label="Punktacja segmentu Jaka to melodia">
    {ranking.map(({ team, points }, index) => <article className="score-card" key={team.id} style={teamStyle(team.id)}>
      <span className="score-symbol">{team.icon}</span><h3>{team.name}</h3><strong>{points}</strong><span className="score-caption">miejsce {index + 1} · punkty segmentu</span>
    </article>)}
  </div>;
}

export function MelodiaScreen({ snapshot, refresh, viewerRole, viewerPlayerId }: MelodiaScreenProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId | null>(null);
  const [stake, setStake] = useState("2");
  const [betting, setBetting] = useState(false);
  const [error, setError] = useState("");

  async function placeBet() {
    if (!selectedTeamId) { setError("Wybierz drużynę, na którą chcesz postawić zakład."); return; }
    setError("");
    setBetting(true);
    try {
      const response = await fetch("/api/segment/melodia/bet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetTeamId: selectedTeamId, stake }) });
      const payload = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) setError(payload?.error ?? "Nie udało się postawić zakładu.");
      else await refresh();
    } catch {
      setError("Nie udało się połączyć z usługą zakładów.");
    } finally {
      setBetting(false);
    }
  }

  const melodia = snapshot.melodia;
  const viewer = viewerPlayerId === undefined ? null : snapshot.players.find((player) => player.id === viewerPlayerId) ?? null;
  const currentSong = melodia.currentSong;
  const lastScoredSong = melodia.songs.filter((song) => song.stage === "result").at(-1) ?? null;
  const currentWinner = currentSong?.winningTeamId ? getTeam(currentSong.winningTeamId) : lastScoredSong?.winningTeamId ? getTeam(lastScoredSong.winningTeamId) : null;
  const leaders = melodia.leadingTeamIds.map(getTeam);

  return <>
    <section className="game-stage floor-stage"><div className="game-stage-content">
      {melodia.stage === "intro" ? <><span className="eyebrow">Piąty segment</span><h1>JAKA TO <em>MELODIA?</em></h1><p>Wszystkie drużyny rywalizują jednocześnie, a muzykę odtwarza prowadzący poza aplikacją.</p><div className="floor-duelists" aria-label="Drużyny uczestniczące w segmencie">{TEAMS.map((team) => <strong key={team.id} style={{ color: team.color, borderColor: team.color }}>{team.icon} {team.name}</strong>)}</div><div className="segment-rules"><span><strong>Uczestnicy:</strong> wszystkie drużyny jednocześnie</span><span><strong>Formuła:</strong> kto pierwszy, ten lepszy</span><span><strong>Artysta:</strong> 1 punkt</span><span><strong>Tytuł piosenki:</strong> 1 punkt</span><span><strong>Śpiewanie:</strong> maks. 5 wersów / 5 punktów</span><span><strong>Pomyłka podczas śpiewania:</strong> 0 punktów za śpiewanie</span><span><strong>Licytacje:</strong> możliwe</span><span><strong>Obstawianie:</strong> najwięcej punktów po 5 piosenkach</span></div></> : null}
      {melodia.stage === "betting" ? <><span className="eyebrow">Jaka to melodia? · zakłady otwarte</span><h1>Wskaż <em>zwycięzcę.</em></h1><p>Zakład dotyczy drużyny z największą liczbą punktów po pięciu piosenkach. Remis na pierwszym miejscu oznacza zwrot stawek.</p>{viewerRole === "player" && viewer && !melodia.viewerBetTargetTeamId ? <div className="floor-bet-panel"><p>Zakład jest opcjonalny. Poczekaj na pierwszą piosenkę albo wybierz drużynę i podaj stawkę. Dostępne żetony: <strong>{formatChips(viewer.tokens)}</strong>.</p><div className="score-choice-grid" aria-label="Wybór drużyny dla zakładu">{TEAMS.map((team) => <button key={team.id} type="button" className={`score-choice${selectedTeamId === team.id ? " is-selected" : ""}`} onClick={() => setSelectedTeamId(team.id)} disabled={betting} style={teamStyle(team.id)} aria-pressed={selectedTeamId === team.id}><span>{team.icon}</span><strong>{team.name}</strong><small>{team.tagline}</small></button>)}</div><label className="field-label" htmlFor="melodia-stake">Stawka w żetonach</label><input id="melodia-stake" className="text-input" inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} disabled={betting} /><div className="floor-bet-buttons"><button className="gold-button" type="button" onClick={placeBet} disabled={betting}>{betting ? "Zapisywanie zakładu…" : "Postaw zakład"}</button></div></div> : null}{viewerRole === "player" && melodia.viewerBetTargetTeamId ? <p className="floor-waiting">Twój zakład na <strong>{getTeam(melodia.viewerBetTargetTeamId).name}</strong> o stawce {formatChips(melodia.viewerBetStake ?? "0")} żetonów został przyjęty.</p> : null}<SegmentScoreboard snapshot={snapshot} /></> : null}
      {(melodia.stage === "song" || melodia.stage === "scoring") && currentSong ? <><span className="eyebrow">Jaka to melodia? · {melodia.stage === "song" ? "piosenka jest odtwarzana" : "punktacja w toku"}</span><h1>{getMelodiaSongLabel(currentSong.sequence)}</h1><p>Postęp: <strong>{currentSong.sequence + 1} / {MELODIA_SONG_COUNT}</strong>. Muzyka jest odtwarzana ręcznie poza aplikacją. Tytuł i artysta nie są wyświetlane.</p><div className="floor-duelists">{TEAMS.map((team) => <strong key={team.id} style={{ color: team.color, borderColor: team.color }}>{team.icon} {team.name}</strong>)}</div>{melodia.stage === "scoring" ? <p className="floor-waiting">Prowadzący zapisuje punktację. Ekran pozostaje na tej piosence.</p> : null}<SegmentScoreboard snapshot={snapshot} /></> : null}
      {melodia.stage === "result" && currentSong ? <><span className="eyebrow">{getMelodiaSongLabel(currentSong.sequence)} · wynik</span><h1>Wygrywa <em>{currentWinner?.name ?? "wybrana drużyna"}</em>.</h1><p>Artysta: {currentSong.artistPoints ?? 0} pkt · tytuł: {currentSong.titlePoints ?? 0} pkt · śpiewanie: {currentSong.singingPoints ?? 0} pkt{currentSong.singingMistake ? " (pomyłka)" : ""}.</p><SegmentScoreboard snapshot={snapshot} /></> : null}
      {melodia.stage === "results" ? <><span className="eyebrow">Piąty segment · wyniki końcowe</span><h1>WYNIKI – <em>JAKA TO MELODIA?</em></h1>{currentWinner ? <p>Ostatnią piosenkę wygrała drużyna <strong>{currentWinner.name}</strong>.</p> : null}<p>{leaders.length === 1 ? <>Zwycięża <strong>{leaders[0]?.name}</strong>.</> : <>Remis na pierwszym miejscu: <strong>{leaders.map((team) => team.name).join(", ") || "brak"}</strong>. Wszystkie stawki zostały zwrócone.</>}</p><SegmentScoreboard snapshot={snapshot} />{viewerRole === "player" && melodia.viewerBetResult ? <p className="floor-waiting">{melodia.viewerBetResult === "won" ? `Twój zakład wygrał. Wypłata: ${formatChips(melodia.viewerBetPayout ?? "0")} żetonów.` : melodia.viewerBetResult === "refunded" ? `Zakład został zwrócony: ${formatChips(melodia.viewerBetPayout ?? "0")} żetonów.` : "Twój zakład nie wygrał."}</p> : null}</> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div></section>
  </>;
}
