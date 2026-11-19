"use client";

import { useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

import { FloorPreloadProgress, useFloorPreload } from "@/components/floor-preload";
import { CasinoLogo } from "@/components/casino-logo";
import { ActiveSegment, useGameSession } from "@/components/game-session";
import { GOLD_TITLE } from "@/components/gold-challenge-screen";
import { compareChipBalances, formatPolishChips } from "@/lib/chips";
import { TEAMS, getSegmentNumber, getTeam } from "@/lib/constants";
import { THE_FLOOR_TITLE } from "@/lib/floor";
import { MELODIA_TITLE } from "@/lib/melodia";
import { POJEDYNKI_TITLE } from "@/lib/pojedynki";
import { SOLENIZANT_TITLE } from "@/lib/solenizant";
import { SPORT_TITLE } from "@/lib/sport";
import type { GameSnapshot, Player, SegmentId } from "@/lib/types";

const playerViews = [
  { id: "lobby", label: "Lobby" },
  { id: "segment", label: "Aktualny segment" },
  { id: "zetony", label: "Punktacja" },
] as const;

const segmentNames = {
  solenizant: SOLENIZANT_TITLE,
  "the-floor": THE_FLOOR_TITLE,
  sport: SPORT_TITLE,
  melodia: MELODIA_TITLE,
  pojedynki: POJEDYNKI_TITLE,
  familiada: "Familiada",
  "gold-challenge": GOLD_TITLE,
  alkoholicy: "ALKOHOLICY",
  finale: "FINAŁ",
} satisfies Record<SegmentId, string>;

function Lobby({ snapshot, player }: { snapshot: GameSnapshot; player: Player }) {
  const team = getTeam(player.teamId);
  const started = snapshot.game.status === "started";

  return (
    <>
      <section className="lobby-hero">
        <div>
          <h1>Witaj, <em>{player.nickname}</em>.</h1>
          <p>{snapshot.finale.stage === "completed" ? "Gra zakończona" : started ? "Gra trwa" : "Oczekiwanie na administratora"}</p>
          <p>Aktualny segment: <strong>{getSegmentNumber(snapshot.game.activeSegment)} · {segmentNames[snapshot.game.activeSegment]}</strong></p>
          <p>Twoja drużyna: <strong style={{ color: team.color }}>{team.icon} {team.name}</strong></p>
        </div>
      </section>

      <section className="roster-section" aria-labelledby="player-roster-heading">
        <div className="section-heading">
          <h2 id="player-roster-heading">Drużyny przy stole</h2>
        </div>
        <div className="roster-grid">
          {TEAMS.map((house) => {
            const members = snapshot.players.filter((candidate) => candidate.teamId === house.id);
            return (
              <article className="house-card" key={house.id} style={{ "--team-color": house.color, "--team-soft": house.softColor } as CSSProperties}>
                <div className="house-card-header">
                  <span className="house-symbol" aria-hidden="true">{house.icon}</span>
                  <div><h3>{house.name}</h3><p>Liczba graczy: {members.length}</p></div>
                </div>
                <div className="member-list">
                  {members.length ? members.map((member) => (
                    <div className="member-row" key={member.id}>
                      <span className="member-avatar" aria-hidden="true">{member.nickname.slice(0, 1).toUpperCase()}</span>
                      <span>{member.nickname}{member.id === player.id && <small>TY</small>}</span>
                      <strong>{formatPolishChips(member.tokens)}</strong>
                    </div>
                  )) : <p className="empty-house">Brak graczy</p>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

function ChipLeaderboard({ players, playerId }: { players: Player[]; playerId: number }) {
  const rankedPlayers = [...players].sort((a, b) => compareChipBalances(b.tokens, a.tokens) || a.id - b.id);
  return (
    <section className="chip-leaderboard" aria-labelledby="chip-leaderboard-heading">
      <div className="section-heading">
        <h1 id="chip-leaderboard-heading">Żetony graczy</h1>
      </div>
      <table aria-labelledby="chip-leaderboard-heading">
        <thead>
          <tr>
            <th scope="col">Miejsce</th>
            <th scope="col">Gracz</th>
            <th scope="col">Drużyna</th>
            <th scope="col">Żetony</th>
          </tr>
        </thead>
        <tbody>
          {rankedPlayers.map((player, index) => {
            const team = getTeam(player.teamId);
            const isYou = player.id === playerId;
            return (
              <tr className={isYou ? "is-you" : undefined} key={player.id}>
                <td>{index + 1}</td>
                <th scope="row">{player.nickname}{isYou && <small>Ty</small>}</th>
                <td style={{ color: team.color }}><span aria-hidden="true">{team.icon} </span>{team.name}</td>
                <td>{formatPolishChips(player.tokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function TeamLeaderboard({ scores }: { scores: GameSnapshot["teamScores"] }) {
  const ranked = TEAMS.map((team) => ({ team, points: scores.find((score) => score.teamId === team.id)?.points ?? 0 }))
    .sort((a, b) => b.points - a.points);
  return (
    <section className="chip-leaderboard" aria-labelledby="team-leaderboard-heading">
      <div className="section-heading"><h1 id="team-leaderboard-heading">Punktacja drużyn</h1></div>
      <table aria-labelledby="team-leaderboard-heading">
        <thead><tr><th scope="col">Miejsce</th><th scope="col">Drużyna</th><th scope="col">Punkty</th></tr></thead>
        <tbody>{ranked.map(({ team, points }) => (
          <tr key={team.id}>
            <td>{ranked.findIndex((row) => row.points === points) + 1}</td>
            <th scope="row" style={{ color: team.color }}><span aria-hidden="true">{team.icon} </span>{team.name}</th>
            <td>{points}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

export function LobbyClient({ playerId, initialSnapshot }: { playerId: number; initialSnapshot: GameSnapshot }) {
  const searchParams = useSearchParams();
  const { snapshot, refresh, syncError, leave, leaving, logoutError } = useGameSession(initialSnapshot, playerId);
  const player = snapshot.players.find((candidate) => candidate.id === playerId);
  const started = snapshot.game.status === "started";
  const floorActive = started && snapshot.game.activeSegment === "the-floor" && snapshot.theFloor.stage !== "results";
  const preload = useFloorPreload(floorActive);
  const requestedView = searchParams.get("widok");
  const currentView = playerViews.find((view) => view.id === requestedView)?.id ?? (started ? "segment" : "lobby");

  if (!player) return null;

  return (
    <main className="app-shell player-dashboard">
      <header className="topbar">
        <CasinoLogo />
        <button className="quiet-button" type="button" disabled={leaving} onClick={leave}>Wyjdź</button>
      </header>
      <div className="player-navigation">
        <p className="player-balance">Twoje żetony <strong>{formatPolishChips(player.tokens)}</strong></p>
        <nav aria-label="Panel gracza">
          {playerViews.map((view) => (
            <button
              key={view.id}
              type="button"
              aria-current={view.id === currentView ? "page" : undefined}
              onClick={() => {
                if (view.id !== requestedView) window.history.pushState(null, "", `?widok=${view.id}`);
              }}
            >
              {view.id === "segment" && started ? getSegmentNumber(snapshot.game.activeSegment) : view.label}
            </button>
          ))}
        </nav>
      </div>
      {syncError && <p className="sync-warning" role="status">Połączenie z grą jest chwilowo niedostępne. Ponawiamy próbę…</p>}
      {logoutError && <p className="form-error" role="alert">Nie udało się wylogować. Spróbuj ponownie.</p>}
      {floorActive && <FloorPreloadProgress preload={preload} />}
      {currentView === "lobby" && <Lobby snapshot={snapshot} player={player} />}
      <div hidden={currentView !== "segment"}>
        {started ? <ActiveSegment snapshot={snapshot} refresh={refresh} viewerPlayerId={playerId} /> : (
          <section className="game-stage">
            <div className="game-stage-content">
              <h1>Aktualny segment</h1>
              <p>Oczekiwanie na administratora.</p>
            </div>
          </section>
        )}
      </div>
      {currentView === "zetony" && <>
        <TeamLeaderboard scores={snapshot.teamScores} />
        <ChipLeaderboard players={snapshot.players} playerId={playerId} />
      </>}
    </main>
  );
}
