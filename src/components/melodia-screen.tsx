import type { CSSProperties } from "react";

import { formatPolishChips } from "@/lib/chips";
import { TEAMS, getTeam } from "@/lib/constants";
import { MELODIA_LOSER_CONTRIBUTION, MELODIA_SONG_COUNT, MELODIA_TITLE, getMelodiaSongLabel } from "@/lib/melodia";
import type { GameSnapshot, MelodiaSong, MelodiaState, TeamId } from "@/lib/types";

export function melodiaTeamStyle(teamId: TeamId) {
  const team = getTeam(teamId);
  return { "--team-color": team.color, "--team-soft": team.softColor } as CSSProperties;
}

export function MelodiaRules() {
  return <>
    <p>Przed Wami 5 utworów muzycznych. Drużyny rywalizują o jak najszybsze rozpoznanie wykonawcy i tytułu piosenki.</p>
    <ul className="melodia-list" aria-label="Punktacja">
      <li>Poprawny wykonawca – 1 punkt.</li>
      <li>Poprawny tytuł – 1 punkt.</li>
      <li>Maksymalnie 2 punkty za utwór.</li>
    </ul>
    <p><strong>Rozliczenie żetonów</strong></p>
    <p>Po zakończeniu wszystkich pięciu utworów każdy zawodnik przegranych drużyn oddaje 5 żetonów. Cała zebrana pula zostaje podzielona po równo pomiędzy zawodników zwycięskiej drużyny.</p>
  </>;

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
        <div>Wykonawca {song.artistPoints ?? 0} pkt · tytuł {song.titlePoints ?? 0} pkt</div>
      </li>)}
    </ul>
  </section>;
}

export function MelodiaRewardSummary({ melodia }: { melodia: MelodiaState }) {
  if (melodia.completedLegacy) return <p>Wyniki archiwalne. {melodia.winningTeamId
    ? `Zwycięzca: ${getTeam(melodia.winningTeamId).name}.`
    : "Remis na pierwszym miejscu."}</p>;

  if (!melodia.winningTeamId) {
    const leaders = melodia.leadingTeamIds.map((teamId) => getTeam(teamId).name).join(", ");
    return melodia.leadingTeamIds.length === 1
      ? <p>Prowadzi <strong>{leaders}</strong>. Prowadzący potwierdzi zwycięzcę.</p>
      : <p>Remis na pierwszym miejscu: <strong>{leaders}</strong>. Rozstrzyga prowadzący.</p>;
  }

  const { reward, settledAt, viewerDelta } = melodia;
  const share = reward && (reward.min === reward.max ? formatPolishChips(reward.min)
    : formatPolishChips(reward.min) + "–" + formatPolishChips(reward.max));
  return <>
    <p>Zwycięża <strong>{getTeam(melodia.winningTeamId).name}</strong>.</p>
    {reward ? <>
      <p>{settledAt ? "Pobrano" : "Do pobrania"} od każdego aktywnego zawodnika przegranych drużyn: <strong>{MELODIA_LOSER_CONTRIBUTION} żetonów</strong>.</p>
      <p>{settledAt ? "Zebrana pula" : "Pula do zebrania"}: <strong>{formatPolishChips(reward.pool)} żetonów</strong>.</p>
      <p>Wypłata dla każdego aktywnego zawodnika zwycięskiej drużyny: <strong>{share} żetonów</strong>.</p>
      {reward.min !== reward.max && <p>Reszta z podziału zwiększa część wypłat o 0,0001 żetonu.</p>}
    </> : <p>Rozliczenie wymaga aktywnych zawodników po obu stronach.</p>}
    {settledAt ? <p>Rozliczenie zatwierdzone.{viewerDelta !== null ? " Zmiana Twojego salda: " + formatPolishChips(viewerDelta) + " żetonów." : ""}</p>
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
      {isFinal && melodia.settledAt && <section className="score-section" aria-label="Salda po rozliczeniu">
        <h2>Żetony po rozliczeniu</h2>
        <ul className="melodia-list">{snapshot.players.map((player) => <li key={player.id}>{player.nickname} · {getTeam(player.teamId).name}: <strong>{formatPolishChips(player.tokens)} żetonów</strong></li>)}</ul>
      </section>}
      {(playing || isFinal) ? <MelodiaRoundResults songs={melodia.songs} /> : null}
    </div>
  </section>;
}
