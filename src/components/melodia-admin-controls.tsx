"use client";

import { useState } from "react";

import { MelodiaRewardSummary, MelodiaRoundResults, MelodiaRules, MelodiaScoreboard, melodiaTeamStyle } from "@/components/melodia-screen";
import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_MAX_SINGING_POINTS, MELODIA_MAX_SONG_POINTS, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, MelodiaSong, TeamId } from "@/lib/types";

type PostAction = (action: string, body?: object) => Promise<void>;
const lineCounts = Array.from({ length: MELODIA_MAX_SINGING_POINTS + 1 }, (_, count) => count);

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
  const [singingPoints, setSingingPoints] = useState(0);
  const [singingMistake, setSingingMistake] = useState(false);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [bids, setBids] = useState<Partial<Record<TeamId, number>>>({});
  const [bidWinnerId, setBidWinnerId] = useState<TeamId | null>(null);
  const [bidCompleted, setBidCompleted] = useState(false);

  const activeBids = TEAMS.flatMap(({ id }) => bids[id] === undefined ? [] : [{ teamId: id, declaredLines: bids[id] }]);
  const winningBid = activeBids.find((bid) => bid.teamId === bidWinnerId);
  const singing = biddingEnabled ? (bidCompleted ? winningBid?.declaredLines ?? 0 : 0) : (singingMistake ? 0 : singingPoints);
  const previewPoints = Number(artistCorrect) + Number(titleCorrect) + singing;
  const canScore = winnerTeamId && (!biddingEnabled || winningBid);

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
      <label className="field-label">Poprawnie zaśpiewane wersy
        <select className="text-input" value={singingPoints} onChange={(event) => setSingingPoints(Number(event.target.value))} disabled={busy || biddingEnabled || singingMistake}>
          {lineCounts.map((count) => <option key={count}>{count}</option>)}
        </select>
      </label>
      <label className="field-label"><input type="checkbox" checked={singingMistake} onChange={(event) => setSingingMistake(event.target.checked)} disabled={busy || biddingEnabled} /> Pomyłka podczas śpiewania</label>
    </div>
    <div className="floor-bet-panel">
      <label className="field-label"><input type="checkbox" checked={biddingEnabled} onChange={(event) => setBiddingEnabled(event.target.checked)} disabled={busy} /> Włącz licytację</label>
      {biddingEnabled ? <>
        <p>Wskaż uczestników i liczbę deklarowanych wersów.</p>
        <div className="floor-pair-selectors">
          {TEAMS.map((team) => <label className="field-label" key={team.id}>{team.icon} {team.name}
            <select className="text-input" value={bids[team.id] ?? ""} disabled={busy} onChange={(event) => {
              const value = event.target.value;
              setBids((current) => ({ ...current, [team.id]: value === "" ? undefined : Number(value) }));
              if (team.id === bidWinnerId && value === "") {
                setBidWinnerId(null);
                setBidCompleted(false);
              }
            }}>
              <option value="">Poza licytacją</option>
              {lineCounts.map((count) => <option key={count} value={count}>{count}</option>)}
            </select>
          </label>)}
          <label className="field-label">Zwycięzca licytacji
            <select className="text-input" value={bidWinnerId ?? ""} disabled={busy || activeBids.length === 0} onChange={(event) => {
              setBidWinnerId(activeBids.find((bid) => bid.teamId === event.target.value)?.teamId ?? null);
              setBidCompleted(false);
            }}>
              <option value="">Wybierz drużynę</option>
              {activeBids.map(({ teamId, declaredLines }) => <option key={teamId} value={teamId}>{getTeam(teamId).name} · {declaredLines}</option>)}
            </select>
          </label>
          <label className="field-label"><input type="checkbox" checked={bidCompleted} onChange={(event) => setBidCompleted(event.target.checked)} disabled={busy || !winningBid} /> Wykonano bez pomyłki</label>
        </div>
      </> : null}
    </div>
    <p>Razem <strong>{previewPoints}/{MELODIA_MAX_SONG_POINTS} pkt</strong> · za śpiewanie {singing} pkt</p>
    <button className="gold-button start-button" type="button" disabled={busy || !canScore} onClick={() => post("score", {
      songId: song.id,
      winnerTeamId,
      artistCorrect,
      titleCorrect,
      singingPoints,
      singingMistake,
      bidding: {
        enabled: biddingEnabled,
        bids: biddingEnabled ? activeBids : [],
        winningBidderTeamId: biddingEnabled ? bidWinnerId : null,
        completed: biddingEnabled && bidCompleted,
      },
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
  const chosenTieTeam = tieChoice && tieChoice.songId === song?.id ? tieChoice.teamId : winningTeamId;

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
          {melodia.leadingTeamIds.length > 1 ? <>
            <div className="score-choice-grid" role="group" aria-label="Rozstrzygnięcie remisu">
              {melodia.leadingTeamIds.map((id) => <TeamChoice key={id} teamId={id} checked={chosenTieTeam === id} disabled={busy}
                onClick={() => setTieChoice({ songId: song.id, teamId: id })} />)}
            </div>
            <button className="secondary-button" type="button" disabled={busy || !chosenTieTeam || chosenTieTeam === winningTeamId}
              onClick={() => post("winner", { songId: song.id, winnerTeamId: chosenTieTeam })}>Rozstrzygnij remis</button>
          </> : null}
          <button className="gold-button start-button" type="button" disabled={busy || !winningTeamId || !melodia.charge || chosenTieTeam !== winningTeamId}
            onClick={() => post("settle", { songId: song.id, winnerTeamId: winningTeamId })}>Zatwierdź rozliczenie żetonów</button>
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
