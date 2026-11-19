"use client";

import { useEffect, useState } from "react";

import { getTheFloorTimes } from "@/lib/floor";
import type { TeamId, TeamMeta, TheFloorDuel } from "@/lib/types";

export function useFloorTimes(duel: TheFloorDuel | null, serverTime: number) {
  const live = duel?.stage === "live";
  const [clock, setClock] = useState({ serverTime, elapsed: 0 });

  useEffect(() => {
    if (!live) return;
    const started = performance.now();
    const update = () => setClock({ serverTime, elapsed: performance.now() - started });
    update();
    const interval = window.setInterval(update, 100);
    return () => window.clearInterval(interval);
  }, [live, serverTime]);

  return duel ? getTheFloorTimes(duel, serverTime + (clock.serverTime === serverTime ? clock.elapsed : 0)) : null;
}

export function FloorDuelists({ teamA, teamB, activeTeamId, times }: {
  teamA: TeamMeta;
  teamB: TeamMeta;
  activeTeamId?: TeamId | null;
  times?: { teamA: number; teamB: number };
}) {
  const contestants = [
    { team: teamA, seconds: times?.teamA },
    { team: teamB, seconds: times?.teamB },
  ];
  return (
    <div className={`floor-duelists${times ? " floor-duelists-live" : ""}`} aria-label={`${teamA.name} kontra ${teamB.name}`}>
      {contestants.map(({ team, seconds }) => (
        <div key={team.id} className={`floor-duelist${activeTeamId === team.id ? " is-active" : ""}`}>
          <span style={{ color: team.color }}>{team.icon} {team.name}</span>
          {seconds !== undefined && <span className="floor-clock" role="timer" aria-label={`Pozostały czas drużyny ${team.name}`}>{seconds} s</span>}
          {times && <span className="floor-turn" aria-hidden={activeTeamId !== team.id}>TERAZ ODPOWIADA</span>}
        </div>
      ))}
    </div>
  );
}
