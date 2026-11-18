"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_SONG_COUNT, MELODIA_TITLE, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, TeamId } from "@/lib/types";

interface MelodiaAdminControlsProps {
  snapshot: GameSnapshot;
  onRefresh: () => Promise<void>;
}

type ApiError = { error?: string };

function teamStyle(teamId: TeamId) {
  const team = getTeam(teamId);
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

export function MelodiaAdminControls({ snapshot, onRefresh }: MelodiaAdminControlsProps) {
  const melodia = snapshot.melodia;
  const song = melodia.currentSong;
  const [winnerTeamId, setWinnerTeamId] = useState<TeamId | null>(null);
  const [artistCorrect, setArtistCorrect] = useState(false);
  const [titleCorrect, setTitleCorrect] = useState(false);
  const [singingPoints, setSingingPoints] = useState("0");
  const [singingMistake, setSingingMistake] = useState(false);
  const [biddingEnabled, setBiddingEnabled] = useState(false);
  const [bids, setBids] = useState<Record<TeamId, string>>({ royal: "", ruby: "", emerald: "", onyx: "" });
  const [winningBidderTeamId, setWinningBidderTeamId] = useState<TeamId | null>(null);
  const [bidCompleted, setBidCompleted] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const scoringSyncKeyRef = useRef<string | null>(null);
  const scoringSyncKey = useMemo(() => song ? `${melodia.stage}:${song.id}:${song.stage}` : melodia.stage, [melodia.stage, song]);

  useEffect(() => {
    if (melodia.stage !== "scoring" || !song || scoringSyncKeyRef.current === scoringSyncKey) return;
    scoringSyncKeyRef.current = scoringSyncKey;
    setWinnerTeamId(null);
    setArtistCorrect(false);
    setTitleCorrect(false);
    setSingingPoints("0");
    setSingingMistake(false);
    setBiddingEnabled(false);
    setBids({ royal: "", ruby: "", emerald: "", onyx: "" });
    setWinningBidderTeamId(null);
    setBidCompleted(false);
  }, [melodia.stage, scoringSyncKey, song]);

  function confirmStart() {
    if (window.confirm("Zamknąć obstawianie i rozpocząć pierwszą piosenkę? Złożone zakłady zostaną rozliczone po wyniku.")) {
      void post("start-song", "/api/segment/melodia/start-song");
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

  const activeBids = TEAMS.flatMap((team) => bids[team.id] === "" ? [] : [{ teamId: team.id, declaredLines: Number(bids[team.id]) }]);
  const winningBid = activeBids.find((bid) => bid.teamId === winningBidderTeamId);
  const previewSinging = singingMistake || (biddingEnabled && !bidCompleted) ? 0 : biddingEnabled ? winningBid?.declaredLines ?? 0 : Number(singingPoints);
  const previewPoints = (artistCorrect ? 1 : 0) + (titleCorrect ? 1 : 0) + previewSinging;
  const scores = TEAMS.map((team) => ({ team, points: melodia.teamScores.find((score) => score.teamId === team.id)?.points ?? 0 })).sort((left, right) => right.points - left.points);

  async function confirmScore() {
    if (!winnerTeamId) { setError("Wybierz drużynę, która zdobyła punkty za tę piosenkę."); return; }
    if (biddingEnabled && !winningBidderTeamId) { setError("Wybierz zwycięskiego licytanta."); return; }
    const completed = await post("score", "/api/segment/melodia/score", {
      winnerTeamId,
      artistCorrect,
      titleCorrect,
      singingPoints: Number(singingPoints),
      singingMistake,
      bidding: { enabled: biddingEnabled, bids: activeBids, winningBidderTeamId, completed: bidCompleted },
    });
    if (completed) setWinnerTeamId(null);
  }

  return <section className="floor-admin-section" aria-label="Sterowanie segmentem Jaka to melodia">
    <article className="floor-admin-panel">
      {melodia.stage === "intro" ? <><span className="panel-index">JAKA TO MELODIA? / PRZYGOTOWANIE</span><h2>{MELODIA_TITLE}</h2><p>Wszystkie cztery drużyny zagrają pięć piosenek. Przed pierwszą piosenką otwórz wspólny rynek zakładów.</p><button className="gold-button start-button" type="button" onClick={() => post("start", "/api/segment/melodia/start")} disabled={pending !== null}>{pending === "start" ? "Rozpoczynanie segmentu…" : "Rozpocznij segment"}</button></> : null}
      {melodia.stage === "betting" ? <><span className="panel-index">JAKA TO MELODIA? / ZAKŁADY</span><h2>Zakłady przed pierwszą piosenką</h2><p>Przyjęte zakłady: <strong>{melodia.betCount}</strong>. Obstawianie jest opcjonalne.</p><button className="gold-button start-button" type="button" onClick={confirmStart} disabled={pending !== null}>{pending === "start-song" ? "Rozpoczynanie piosenki…" : "Rozpocznij piosenkę nr 1"}</button></> : null}
      {melodia.stage === "song" && song ? <><span className="panel-index">{getMelodiaSongLabel(song.sequence)} / TRWA</span><h2>{getMelodiaSongLabel(song.sequence)}</h2><p>Muzyka jest odtwarzana poza aplikacją. Gdy drużyny odpowiedzą, otwórz punktację bez zmiany ekranu graczy.</p><button className="gold-button start-button" type="button" onClick={() => post("scoring", "/api/segment/melodia/scoring")} disabled={pending !== null}>{pending === "scoring" ? "Otwieranie punktacji…" : "Przejdź do punktacji"}</button></> : null}
      {melodia.stage === "scoring" && song ? <><span className="panel-index">{getMelodiaSongLabel(song.sequence)} / PUNKTACJA</span><h2>Przyznaj punkty</h2><p>Wybierz jedną drużynę, która pierwsza rozpoznała piosenkę. Możesz poprawiać wybór aż do zatwierdzenia.</p><div className="score-choice-grid" aria-label="Drużyna zdobywająca punkty">{TEAMS.map((team) => <button key={team.id} type="button" className={`score-choice${winnerTeamId === team.id ? " is-selected" : ""}`} onClick={() => setWinnerTeamId(team.id)} disabled={pending !== null} style={teamStyle(team.id)} aria-pressed={winnerTeamId === team.id}><span>{team.icon}</span><strong>{team.name}</strong><small>{winnerTeamId === team.id ? "Wybrana drużyna" : "Wybierz drużynę"}</small></button>)}</div><div className="floor-pair-selectors"><label className="field-label"><input type="checkbox" checked={artistCorrect} onChange={(event) => setArtistCorrect(event.target.checked)} disabled={pending !== null} /> Artysta poprawny (+1)</label><label className="field-label"><input type="checkbox" checked={titleCorrect} onChange={(event) => setTitleCorrect(event.target.checked)} disabled={pending !== null} /> Tytuł poprawny (+1)</label><label className="field-label" htmlFor="melodia-singing">Poprawne wersy (0–5)<select id="melodia-singing" className="text-input" value={singingPoints} onChange={(event) => setSingingPoints(event.target.value)} disabled={pending !== null || biddingEnabled || singingMistake}>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="field-label"><input type="checkbox" checked={singingMistake} onChange={(event) => setSingingMistake(event.target.checked)} disabled={pending !== null || biddingEnabled} /> Pomyłka (0 punktów za śpiewanie)</label></div><div className="floor-bet-panel"><label className="field-label"><input type="checkbox" checked={biddingEnabled} onChange={(event) => { setBiddingEnabled(event.target.checked); setWinningBidderTeamId(null); setBidCompleted(false); }} disabled={pending !== null} /> Włącz licytację dla tej piosenki</label>{biddingEnabled ? <><p>Wskaż drużyny biorące udział i liczbę deklarowanych wersów. Nie stosujemy mnożników ani dodatkowych kar.</p><div className="floor-pair-selectors">{TEAMS.map((team) => <label className="field-label" key={team.id}>{team.icon} {team.name}<select className="text-input" value={bids[team.id]} onChange={(event) => setBids((current) => ({ ...current, [team.id]: event.target.value }))} disabled={pending !== null}><option value="">Nie bierze udziału</option>{[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} wersów</option>)}</select></label>)}</div><div className="score-choice-grid">{activeBids.map((bid) => { const team = getTeam(bid.teamId); return <button key={team.id} type="button" className={`score-choice${winningBidderTeamId === team.id ? " is-selected" : ""}`} onClick={() => { setWinningBidderTeamId(team.id); setWinnerTeamId(team.id); }} disabled={pending !== null} style={teamStyle(team.id)}><span>{team.icon}</span><strong>{team.name}</strong><small>Wygrywający licytant: {bid.declaredLines} wersów</small></button>; })}</div><label className="field-label"><input type="checkbox" checked={bidCompleted} onChange={(event) => setBidCompleted(event.target.checked)} disabled={pending !== null} /> Licytacja została wykonana bez pomyłki</label></> : null}</div><p className="floor-waiting">Wyliczone punkty: <strong>{previewPoints} / 7</strong> (artysta {artistCorrect ? 1 : 0}, tytuł {titleCorrect ? 1 : 0}, śpiewanie {previewSinging}).</p><button className="gold-button start-button" type="button" onClick={confirmScore} disabled={pending !== null}>{pending === "score" ? "Zapisywanie punktów…" : "Zatwierdź punkty"}</button></> : null}
      {melodia.stage === "result" && song ? <><span className="panel-index">{getMelodiaSongLabel(song.sequence)} / WYNIK</span><h2>Wynik zapisany.</h2><p>Wygrywa <strong>{song.winningTeamId ? getTeam(song.winningTeamId).name : "wybrana drużyna"}</strong>. Punktacja została dodana do wyniku segmentu i globalnej tablicy.</p><button className="gold-button start-button" type="button" onClick={() => post("next", "/api/segment/melodia/next")} disabled={pending !== null}>{pending === "next" ? "Przechodzenie dalej…" : "Następna piosenka"}</button></> : null}
      {melodia.stage === "results" ? <><span className="panel-index">JAKA TO MELODIA? / WYNIKI</span><h2>Segment zakończony.</h2><p>{melodia.leadingTeamIds.length === 1 ? `Wygrywa ${getTeam(melodia.leadingTeamIds[0]).name}. Zakłady zostały rozliczone.` : "Remis na pierwszym miejscu — zakłady zostały zwrócone."}</p><button className="gold-button start-button" type="button" onClick={() => post("complete", "/api/segment/melodia/complete")} disabled={pending !== null}>{pending === "complete" ? "Zapisywanie…" : "Zakończ segment"}</button></> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </article>
    <div className="score-section"><div className="section-heading"><div><span className="eyebrow">Jaka to melodia?</span><h2>Punkty segmentu</h2></div><span className="poll-note">Odświeżanie co 4 sekundy</span></div><div className="score-grid">{scores.map(({ team, points }, index) => <article className="score-card" key={team.id} style={teamStyle(team.id)}><span className="score-symbol">{team.icon}</span><h3>{team.name}</h3><strong>{points}</strong><span className="score-caption">miejsce {index + 1} · punkty segmentu</span></article>)}</div></div>
  </section>;
}
