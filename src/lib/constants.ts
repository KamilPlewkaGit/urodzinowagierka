import type { TeamId, TeamMeta } from "@/lib/types";

export const TEAM_IDS = ["royal", "ruby", "emerald", "onyx"] as const satisfies readonly TeamId[];

export const TEAMS: readonly TeamMeta[] = [
  { id: "royal", name: "Royal Club", tagline: "Calculated & composed", icon: "♛", color: "#d6b76f", softColor: "#3f3320" },
  { id: "ruby", name: "Ruby Syndicate", tagline: "Fearless & fiery", icon: "♦", color: "#f15d61", softColor: "#4d2026" },
  { id: "emerald", name: "Emerald Circle", tagline: "Sharp & fortunate", icon: "♠", color: "#42c797", softColor: "#173d32" },
  { id: "onyx", name: "Onyx House", tagline: "Quiet & relentless", icon: "●", color: "#a9adbd", softColor: "#292c38" },
];

export const STARTING_TOKENS = 100;
export const POLL_INTERVAL_MS = 4_000;

export function getTeam(teamId: TeamId) {
  return TEAMS.find((team) => team.id === teamId) ?? TEAMS[0];
}
