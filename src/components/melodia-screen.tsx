import type { CSSProperties } from "react";

import { formatPolishChips } from "@/lib/chips";
import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_REWARD, MELODIA_SONG_COUNT, MELODIA_TITLE, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, MelodiaSong, MelodiaState, TeamId } from "@/lib/types";

export function melodiaTeamStyle(teamId: TeamId) {
  const team = getTeam(teamId);
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

export function MelodiaRules() {
  return <ul className="melodia-list">
    <li>Cztery drużyny grają naraz przez pięć piosenek. Kto pierwszy, ten lepszy.</li>
    <li>Za poprawne podanie artysty i tytułu można zdobyć po 1 punkcie.</li>
    <li>Każdy poprawnie zaśpiewany wers daje 1 punkt, maksymalnie 5. Pomyłka zeruje punkty za śpiewanie.</li>
    <li>W licytacji drużyny deklarują liczbę wersów do zaśpiewania.</li>
    <li>Każdy zawodnik zwycięskiej drużyny otrzymuje {MELODIA_REWARD} żetony od zawodników pozostałych drużyn.</li>
  </ul>;
}

export function MelodiaScoreboard({ melodia }: { melodia: MelodiaState }) {
  const winnerId = melodia.winningTeamId;
  const ranking = melodia.teamScores.map(({ teamId, points }) => ({ team: getTeam(teamId), points }))
    .sort((left, right) => right.points - left.points || Number(right.team.id === winnerId) - Number(left.team.id === winnerId));

  return <div className="score-grid" aria-label="Punktacja segmentu Jaka to melodia">
    {ranking.map(({ team, points }) => {
      const place = 1 + ranking.filter((entry) => entry.points > points || (entry.team.id === winnerId && team.id !== winnerId)).length;
      return <article className="score-card" key={team.id} style={melodiaTeamStyle(team.id)}>
        <span className="score-symbol">{team.icon}</span>
        <h3>{team.name}</h3>
        <strong>{points}</strong>
        <span className="score-caption">Miejsce {place} · punkty segmentu</span>
      </article>;
    })}
  </div>;
}

export function MelodiaRoundResults({ songs }: { songs: MelodiaSong[] }) {
  const finished = songs.filter((song) => song.stage === "result" && song.winningTeamId !== null);
  if (!finished.length) return null;
  return <section className="score-section" aria-label="Wyniki piosenek">
    <h2>Wyniki piosenek</h2>
    <ul className="melodia-list">
      {finished.map((song) => <li key={song.id}>
        <strong>{getMelodiaSongLabel(song.sequence)} · {song.winningTeamId && getTeam(song.winningTeamId).name}</strong>
        <div>Artysta {song.artistPoints ?? 0} pkt · tytuł {song.titlePoints ?? 0} pkt · śpiewanie {song.singingPoints ?? 0} pkt
          {song.singingMistake ? " (pomyłka)" : ""}
          {song.bidWinnerTeamId && song.bidWinnerTeamId !== song.winningTeamId ? ` dla drużyny ${getTeam(song.bidWinnerTeamId).name}` : ""}
        </div>
      </li>)}
    </ul>
  </section>;
}

export function MelodiaRewardSummary({ melodia }: { melodia: MelodiaState }) {
  if (melodia.completedLegacy) return <p>Wyniki archiwalne. {melodia.winningTeamId
    ? `Zwycięzca: ${getTeam(melodia.winningTeamId).name}.`
    : "Remis na pierwszym miejscu."}</p>;

  if (!melodia.winningTeamId) {
    return <p>Remis na pierwszym miejscu: <strong>{melodia.leadingTeamIds.map((teamId) => getTeam(teamId).name).join(", ")}</strong>.
      {" "}Rozstrzyga prowadzący.</p>;
  }

  const { charge, settledAt, viewerDelta } = melodia;
  const debit = charge && (charge.min === charge.max ? formatPolishChips(charge.min) : `${formatPolishChips(charge.min)}–${formatPolishChips(charge.max)}`);
  return <>
    <p>Zwycięża <strong>{getTeam(melodia.winningTeamId).name}</strong>.</p>
    <p><strong>{MELODIA_REWARD} żetony</strong> dla każdego aktywnego zawodnika zwycięskiej drużyny.</p>
    {debit ? <p>{settledAt ? "Pobrano" : "Do pobrania"} od każdego aktywnego zawodnika przegranych drużyn: <strong>{debit} żetonów</strong>.
      {charge && charge.min !== charge.max ? " Kwoty różnią się o 0,0001 żetonu ze względu na podział reszty." : ""}</p>
      : <p>Rozliczenie wymaga aktywnych zawodników po obu stronach.</p>}
    {settledAt ? <p>Rozliczenie zatwierdzone.{viewerDelta !== null ? ` Zmiana Twojego salda: ${formatPolishChips(viewerDelta)} żetonów.` : ""}</p>
      : <p>Rozliczenie czeka na zatwierdzenie.</p>}
  </>;
}

export function MelodiaScreen({ snapshot }: { snapshot: GameSnapshot }) {
  const { melodia } = snapshot;
  const { currentSong, stage } = melodia;
  const isFinal = stage === "results" || stage === "completed";
  const playing = stage === "song" || stage === "scoring" || stage === "result";

  return <section className="game-stage floor-stage">
    <div className="game-stage-content">
      {isFinal ? <><h1>WYNIKI – <em>JAKA TO MELODIA?</em></h1><MelodiaRewardSummary melodia={melodia} /></> : <>
        {playing && currentSong ? <>
          <span className="eyebrow">{MELODIA_TITLE}</span>
          <h1>{getMelodiaSongLabel(currentSong.sequence)}</h1>
          <p>Postęp {currentSong.sequence + 1}/{MELODIA_SONG_COUNT}</p>
        </> : <>
          <h1>{MELODIA_TITLE.toLocaleUpperCase("pl")}</h1>
          <p>Muzykę odtwarza prowadzący poza aplikacją.</p>
          <MelodiaRules />
        </>}
      </>}
      <MelodiaScoreboard melodia={melodia} />
      {(playing || isFinal) ? <MelodiaRoundResults songs={melodia.songs} /> : null}
    </div>
  </section>;
}
