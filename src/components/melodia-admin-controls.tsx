"use client";

import { useState } from "react";

import { MelodiaRewardSummary, MelodiaRoundResults, MelodiaRules, MelodiaScoreboard, melodiaTeamStyle } from "@/components/melodia-screen";
import { formatPolishChips } from "@/lib/chips";
import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_MAX_SONG_POINTS, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, MelodiaSong, TeamId } from "@/lib/types";

type PostAction = (action: string, body?: object) => Promise<void>;

function TeamChoice({ teamId, checked, onClick, disabled }: {
  teamId: TeamId;
  checked: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  const team = getTeam(teamId);
  return <button type="button" className={`score-choice${checked ? " is-selected" : ""}`}
    onClick={onClick} disabled={disabled} style={melodiaTeamStyle(team.id)} aria-pressed={checked}>
    <span>{team.icon}</span><strong>{team.name}</strong>
  </button>;
}

function MelodiaScoringForm({ song, busy, post }: { song: MelodiaSong; busy: boolean; post: PostAction }) {
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [artistCorrect, setArtistCorrect] = useState(false);
  const [titleCorrect, setTitleCorrect] = useState(false);
  const previewPoints = Number(artistCorrect) + Number(titleCorrect);

  return <>
    <h2>Punktacja · {getMelodiaSongLabel(song.sequence)}</h2>
    <p>Wybierz drużynę, która odpowiedziała jako pierwsza.</p>
    <div className="score-choice-grid" role="group" aria-label="Drużyna, która odpowiedziała pierwsza">
      {TEAMS.map((team) => <TeamChoice key={team.id} teamId={team.id} checked={winnerTeamId === team.id}
        onClick={() => setWinnerTeamId(team.id)} disabled={busy} />)}
    </div>
    <div className="floor-pair-selectors">
      <label className="field-label"><input type="checkbox" checked={artistCorrect} onChange={(event) => setArtistCorrect(event.target.checked)} disabled={busy} /> Poprawny artysta (+1)</label>
      <label className="field-label"><input type="checkbox" checked={titleCorrect} onChange={(event) => setTitleCorrect(event.target.checked)} disabled={busy} /> Poprawny tytuł (+1)</label>
    </div>
    <p>Razem <strong>{previewPoints}/{MELODIA_MAX_SONG_POINTS} pkt</strong></p>
    <button className="gold-button start-button" type="button" disabled={busy || !winnerTeamId} onClick={() => post("score", {
      songId: song.id, winnerTeamId, artistCorrect, titleCorrect,
    })}>Zatwierdź punkty</button>
  </>;
}

export function MelodiaAdminControls({ snapshot, onRefresh }: { snapshot: GameSnapshot; onRefresh: () => Promise<void> }) {
  const { melodia } = snapshot;
  const { currentSong: song, stage, winningTeamId, settledAt } = melodia;
  const [selectedTeams, setSelectedTeams] = useState<TeamId[]>([]);
  const [tieChoice, setTieChoice] = useState<{ songId: number; teamId: TeamId } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function post(action: string, body?: object) {
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/api/segment/melodia/${action}`, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setError(payload?.error ?? "Nie udało się wykonać tej operacji.");
      }
      await onRefresh();
    } catch {
      setError("Nie udało się połączyć z usługą gry.");
    } finally {
      setBusy(false);
    }
  }

  const isFinal = stage === "results" || stage === "completed";
  const chosenTeam = tieChoice?.songId === song?.id ? tieChoice?.teamId
    : winningTeamId ?? (melodia.leadingTeamIds.length === 1 ? melodia.leadingTeamIds[0] : null);
  const preview = melodia.transferPreview ?? [];
  const insufficient = new Set(melodia.insufficientPlayers ?? []);
  const players = new Map(snapshot.players.map((player) => [player.id, player]));

  return <section className="floor-admin-section" aria-label="Sterowanie segmentem Jaka to melodia">
    <article className="floor-admin-panel" aria-busy={busy}>
      {(stage === "intro" || stage === "ready") ? <>
        <h2>JAKA TO MELODIA?</h2>
        <MelodiaRules />
        {stage === "intro" ? <>
          <p>Wybierz wszystkie cztery drużyny.</p>
          <div className="score-choice-grid" role="group" aria-label="Uczestniczące drużyny">
            {TEAMS.map((team) => <TeamChoice key={team.id} teamId={team.id} checked={selectedTeams.includes(team.id)} disabled={busy}
              onClick={() => setSelectedTeams((current) => current.includes(team.id) ? current.filter((id) => id !== team.id) : [...current, team.id])} />)}
          </div>
          <button className="gold-button start-button" type="button" onClick={() => post("configure", { teamIds: selectedTeams })}
            disabled={busy || selectedTeams.length !== TEAMS.length}>Zatwierdź drużyny</button>
        </> : <button className="gold-button start-button" type="button" onClick={() => post("start")} disabled={busy}>Rozpocznij segment</button>}
      </> : null}
      {stage === "song" && song ? <>
        <h2>{getMelodiaSongLabel(song.sequence)}</h2>
        <p>Odtwórz utwór poza aplikacją.</p>
        <button className="gold-button start-button" type="button" onClick={() => post("scoring", { songId: song.id })} disabled={busy}>Przejdź do punktacji</button>
      </> : null}
      {stage === "scoring" && song ? <MelodiaScoringForm key={song.id} song={song} busy={busy} post={post} /> : null}
      {stage === "result" && song ? <>
        <h2>{getMelodiaSongLabel(song.sequence)}</h2>
        <p>Punkty zapisane.</p>
        <button className="gold-button start-button" type="button" onClick={() => post("next", { songId: song.id })} disabled={busy}>Następna piosenka</button>
      </> : null}
      {isFinal ? <>
        <h2>WYNIKI – JAKA TO MELODIA?</h2>
        <MelodiaScoreboard melodia={melodia} />
        <MelodiaRewardSummary melodia={melodia} />
        {stage === "results" && song && !settledAt ? <>
          {melodia.leadingTeamIds.length > 1 && (
            <div className="score-choice-grid" role="group" aria-label="Rozstrzygnięcie remisu">
              {melodia.leadingTeamIds.map((id) => <TeamChoice key={id} teamId={id} checked={chosenTeam === id} disabled={busy}
                onClick={() => setTieChoice({ songId: song.id, teamId: id })} />)}
            </div>
          )}
          {chosenTeam !== winningTeamId && (
            <button className="secondary-button" type="button" disabled={busy || !chosenTeam}
              onClick={() => post("winner", { songId: song.id, winnerTeamId: chosenTeam })}>Potwierdź zwycięską drużynę</button>
          )}
          {winningTeamId && preview.length > 0 && (
            <section className="chip-leaderboard" aria-labelledby="melodia-preview-title">
              <h3 id="melodia-preview-title">Podgląd transferów</h3>
              <table>
                <thead><tr><th scope="col">Gracz</th><th scope="col">Drużyna</th><th scope="col">Zmiana salda</th></tr></thead>
                <tbody>{preview.map(({ playerId, delta }) => {
                  const player = players.get(playerId);
                  return player && (
                    <tr key={playerId}>
                      <th scope="row">{player.nickname}{insufficient.has(playerId) && <small>Za mało żetonów</small>}</th>
                      <td>{getTeam(player.teamId).name}</td>
                      <td>{delta.startsWith("-") ? "" : "+"}{formatPolishChips(delta)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {insufficient.size > 0 && <p className="form-error" role="alert">Wskazani gracze mają mniej niż 5 żetonów. Skoryguj ich salda w panelu przed zatwierdzeniem.</p>}
            </section>
          )}
          <button className="gold-button start-button" type="button"
            disabled={busy || !winningTeamId || chosenTeam !== winningTeamId || !preview.length || insufficient.size > 0}
            onClick={() => post("settle", { songId: song.id, winnerTeamId: winningTeamId, rosterIds: preview.map((entry) => entry.playerId).sort((a, b) => a - b) })}>Zatwierdź rozliczenie żetonów</button>
        </> : null}
        {stage === "results" && song && settledAt ? <button className="gold-button start-button" type="button"
          onClick={() => post("complete", { songId: song.id })} disabled={busy}>Zakończ segment</button> : null}
        {stage === "completed" ? <p>Segment zakończony.</p> : null}
      </> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </article>
    {stage !== "intro" && !isFinal ? <MelodiaScoreboard melodia={melodia} /> : null}
    <MelodiaRoundResults songs={melodia.songs} />
  </section>;
}
