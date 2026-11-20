export const SPORT_TITLE = "Sport";
export const SPORT_CHALLENGE_COUNT = 8;
export const SPORT_BONUS_ROUND_COUNT = 2;
export const SPORT_CORRECT_BET_PROFIT = "2.0000";

export type SportPairSlot = "a" | "b";

export interface SportChallengeDefinition {
  sequence: number;
  pairSlot: SportPairSlot;
  name: string;
  activity: string;
  teamANumbers: readonly number[];
  teamBNumbers: readonly number[];
}

export const SPORT_CHALLENGES: readonly SportChallengeDefinition[] = [
  { sequence: 0, pairSlot: "a", name: "Pompki", activity: "Pompki", teamANumbers: [1], teamBNumbers: [2] },
  { sequence: 1, pairSlot: "b", name: "Utrzymaj ciężar", activity: "Kto dłużej utrzyma ciężar?", teamANumbers: [1], teamBNumbers: [1] },
  { sequence: 2, pairSlot: "a", name: "Pozycje z jogi", activity: "Odtwórz pozycje z jogi", teamANumbers: [2, 3], teamBNumbers: [2, 3] },
  { sequence: 3, pairSlot: "b", name: "Pozycje z jogi", activity: "Odtwórz pozycje z jogi", teamANumbers: [2, 3], teamBNumbers: [2, 3] },
  { sequence: 4, pairSlot: "a", name: "Zdmuchnij kubek", activity: "Zdmuchnij kubek przeciwnikowi", teamANumbers: [4], teamBNumbers: [4] },
  { sequence: 5, pairSlot: "b", name: "Zdmuchnij kubek", activity: "Zdmuchnij kubek przeciwnikowi", teamANumbers: [4], teamBNumbers: [4] },
  { sequence: 6, pairSlot: "a", name: "Siłowanie na rękę", activity: "Siłowanie na rękę", teamANumbers: [5], teamBNumbers: [5] },
  { sequence: 7, pairSlot: "b", name: "Siłowanie na rękę", activity: "Siłowanie na rękę", teamANumbers: [5], teamBNumbers: [5] },
];

export function getSportChallenge(sequence: number) {
  return SPORT_CHALLENGES.find((challenge) => challenge.sequence === sequence) ?? null;
}
