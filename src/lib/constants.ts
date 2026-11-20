import type { SegmentId, TeamId, TeamMeta } from "@/lib/types";

export const TEAM_IDS = ["royal", "ruby", "emerald", "onyx"] as const satisfies readonly TeamId[];

export const TEAMS: readonly TeamMeta[] = [
  { id: "royal", name: "Asy z Rękawa", tagline: "Spokojni i wyrachowani", icon: "♛", color: "#d6b76f", softColor: "#3f3320" },
  { id: "ruby", name: "Królowie Blefu", tagline: "Nieustraszeni i ognisti", icon: "♦", color: "#f15d61", softColor: "#4d2026" },
  { id: "emerald", name: "Ruletkowi Rozbójnicy", tagline: "Bystrzy i szczęśliwi", icon: "♠", color: "#42c797", softColor: "#173d32" },
  { id: "onyx", name: "Żetonowi Magnaci", tagline: "Cisi i nieustępliwi", icon: "◈", color: "#a9adbd", softColor: "#292c38" },
];

// Keep the published event numbers even where the app skips a segment.
const segmentNumerals: Record<SegmentId, string> = {
  solenizant: "I",
  "the-floor": "II",
  sport: "III",
  melodia: "V",
  pojedynki: "VI",
  familiada: "VIII",
  "gold-challenge": "IX",
  alkoholicy: "X",
  finale: "XI",
};

export function getSegmentNumber(segment: SegmentId) {
  return "Segment " + segmentNumerals[segment];
}

export const STARTING_TOKENS = 100;
export const POLL_INTERVAL_MS = 4_000;

export function getTeam(teamId: TeamId) {
  return TEAMS.find((team) => team.id === teamId) ?? TEAMS[0];
}

export const OBSERVER_NICKNAME = "obserwator";

export const LEGACY_DUEL_BET_STAKE = "2.0000";
export const STANDARD_DUEL_BET_STAKE = "4.0000";
export const FAMILIADA_BET_STAKE = "8.0000";
export const CHARADES_BET_STAKE = "2.0000";
export const FINALE_QUESTION_COUNT = 6;

export const STANDARD_DUEL_BET_DESCRIPTION = "Każdy gracz spoza pary może obstawić zwycięzcę za 4 żetony. Trafiony zakład daje 8 żetonów wypłaty (4 zwrotu stawki i 4 zysku).";
export const FAMILIADA_BET_DESCRIPTION = "Każdy gracz spoza pary może obstawić zwycięzcę za 8 żetonów. Trafiony zakład daje 16 żetonów wypłaty (8 zwrotu stawki i 8 zysku).";
