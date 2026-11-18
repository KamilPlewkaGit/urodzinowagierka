import type { TheFloorDuel } from "@/lib/types";

export const THE_FLOOR_TITLE = "The Floor";
export const THE_FLOOR_DUEL_SECONDS = 45;
export const THE_FLOOR_PASS_PENALTY_SECONDS = 3;
export const THE_FLOOR_BET_STAKE = "2.0000";

export const THE_FLOOR_CATEGORY_IDS = [
  "znajome-twarze", "lokalne-miejsca", "loga", "od-tylu", "dzialania", "rebusy",
] as const;

export const THE_FLOOR_CATEGORY_META = {
  "znajome-twarze": {
    name: "Znajome twarze",
    instructions: "Podajcie nazwisko lub pseudonim osoby na zdjęciu. Jeśli widać dwie osoby, wystarczy rozpoznać jedną z nich.",
    aliases: ["znane-twarze"],
  },
  "lokalne-miejsca": {
    name: "Lokalne miejsca",
    instructions: "Podajcie nazwę lub lokalizację miejsca pokazanego na zdjęciu.",
    aliases: ["miejsca"],
  },
  loga: { name: "Loga", instructions: "Rozpoznajcie markę po logotypie.", aliases: ["logotypy"] },
  "od-tylu": { name: "Czytanie od tyłu", instructions: "Odczytajcie wyraz zapisany od tyłu.", aliases: ["czytanie-od-tylu"] },
  dzialania: { name: "Działania", instructions: "Policzcie działanie i podajcie wynik.", aliases: ["the-floor-dzialania"] },
  rebusy: { name: "Rebusy", instructions: "Rozwiążcie rebus widoczny na grafice.", aliases: ["rebus"] },
} satisfies Record<string, { name: string; instructions: string; aliases: string[] }>;

export function getTheFloorTimes(duel: TheFloorDuel, now = Date.now()) {
  let teamA = duel.teamATimeSeconds;
  let teamB = duel.teamBTimeSeconds;
  if (duel.stage === "live" && duel.activeTeamId !== null && duel.turnStartedAt) {
    const elapsed = Math.max(0, Math.floor((now - new Date(duel.turnStartedAt).getTime()) / 1000));
    if (duel.activeTeamId === duel.teamAId) teamA = Math.max(0, teamA - elapsed);
    if (duel.activeTeamId === duel.teamBId) teamB = Math.max(0, teamB - elapsed);
  }
  return { teamA, teamB };
}
