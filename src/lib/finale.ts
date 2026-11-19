import "server-only";

import { TEAM_IDS } from "@/lib/constants";
import type { FinaleDirection, FinaleSnapshot, FinaleStage, FinaleUnit, TeamId, TeamScore } from "@/lib/types";
import type { FinaleAction } from "@/lib/validation";

const questions = [
  { text: "Ile procent kobiet w wieku produkcyjnym (tj. 18–60 lat) nie pracuje?", answer: "20,3%", unit: "percent" },
  { text: "Ilu Polaków nosi nazwisko Plewka?", answer: "1483", unit: "people" },
  { text: "Ilu Polaków zginęło podczas II wojny światowej?", answer: "5,9 mln", unit: "people" },
  { text: "Ile lat średnio trwa małżeństwo przed rozwodem?", answer: "15 lat", unit: "years" },
] as const satisfies readonly { text: string; answer: string; unit: FinaleUnit }[];

type Round = {
  estimate: number | null;
  direction: FinaleDirection | null;
  winner: TeamId | null;
  points?: number;
};

export type StoredFinale = {
  stage: Exclude<FinaleStage, "intro">;
  ranking: TeamScore[];
  finalists: [TeamScore, TeamScore];
  questionIndex: number;
  rounds: Round[];
  overallWinner?: TeamId;
  finalRanking?: TeamScore[];
};

export class FinaleConflict extends Error {}

export function rankFinaleTeams(scores: readonly TeamScore[]) {
  return TEAM_IDS.map((teamId) => ({ teamId, points: scores.find((score) => score.teamId === teamId)?.points ?? 0 }))
    .sort((first, second) => second.points - first.points);
}

function eligibleOrders(ranking: TeamScore[]): [TeamId, TeamId][] {
  return ranking.filter((team) => team.points === ranking[0].points).flatMap((first) => {
    const others = ranking.filter((team) => team.teamId !== first.teamId);
    return others.filter((team) => team.points === others[0].points).map((second): [TeamId, TeamId] => [first.teamId, second.teamId]);
  });
}

function needsConfirmation(state: StoredFinale | null, ranking: TeamScore[]) {
  return !state || (state.stage === "ready" && ranking.some((team, index) => {
    const confirmed = state.ranking[index];
    return team.teamId !== confirmed.teamId || team.points !== confirmed.points;
  }));
}

export function getFinaleSnapshot(state: StoredFinale | null, revision: string, scores: TeamScore[], isAdmin: boolean): FinaleSnapshot {
  const stage = state?.stage ?? "intro";
  const preparing = stage === "intro" || stage === "ready";
  const ranking = stage === "completed" && state?.finalRanking ? state.finalRanking : rankFinaleTeams(scores);
  const current = state && !preparing && stage !== "summary" && stage !== "completed" ? state.questionIndex : null;
  const question = current === null ? null : questions[current];
  const round = current === null ? null : state?.rounds[current];
  const confirm = needsConfirmation(state, ranking);
  const leaders = stage === "summary" || stage === "completed" ? ranking.filter((team) => team.points === ranking[0].points).map((team) => team.teamId) : [];
  const overallWinner = state?.overallWinner && leaders.includes(state.overallWinner) ? state.overallWinner : leaders.length === 1 ? leaders[0] : null;
  return {
    revision,
    stage,
    ranking,
    eligibleOrders: preparing ? eligibleOrders(ranking) : [],
    finalists: confirm ? null : state?.finalists ?? null,
    needsConfirmation: confirm,
    question: question && round && current !== null ? {
      number: current + 1,
      text: question.text,
      unit: question.unit,
      estimate: round.estimate,
      direction: round.direction,
      answer: stage === "question" ? null : question.answer,
      ...(isAdmin ? { adminAnswer: question.answer } : {}),
      winner: round.winner,
      points: round.points ?? null,
    } : null,
    winners: state?.rounds.map((round) => round.winner) ?? [],
    roundPoints: state?.rounds.map((round) => round.points ?? null) ?? [],
    overallLeaders: leaders,
    overallWinner,
  };
}

export function advanceFinale(state: StoredFinale | null, command: FinaleAction["command"], ranking: TeamScore[]): StoredFinale | null {
  if (command.action === "restart") return null;
  if (command.action === "confirm-finalists" && needsConfirmation(state, ranking)) {
    const [first, second] = command.teams;
    if (!eligibleOrders(ranking).some(([a, b]) => a === first && b === second)) {
      throw new FinaleConflict("Wybierz drużyny z najwyższą punktacją i rozstrzygnij ewentualny remis.");
    }
    return {
      stage: "ready",
      ranking,
      finalists: [ranking.find((team) => team.teamId === first)!, ranking.find((team) => team.teamId === second)!],
      questionIndex: 0,
      rounds: questions.map(() => ({ estimate: null, direction: null, winner: null })),
    };
  }
  if (!state) throw new FinaleConflict("Najpierw zatwierdź finalistów.");
  const { stage, questionIndex, rounds } = state;
  const round = rounds[questionIndex];
  switch (command.action) {
    case "start":
      if (stage !== "ready") break;
      if (needsConfirmation(state, ranking)) throw new FinaleConflict("Punktacja się zmieniła. Zatwierdź finalistów ponownie.");
      return { ...state, stage: "question" };
    case "estimate":
      if (stage !== "question" || round.estimate !== null) break;
      if (questions[questionIndex].unit === "percent" && command.value > 100) {
        throw new FinaleConflict("Podaj procent od 0 do 100.");
      }
      if (questions[questionIndex].unit === "people" && !Number.isInteger(command.value)) {
        throw new FinaleConflict("Podaj liczbę osób w pełnych jednostkach.");
      }
      round.estimate = command.value;
      return state;
    case "direction":
      if (stage !== "question" || round.estimate === null || round.direction !== null) break;
      round.direction = command.value;
      return state;
    case "reveal":
      if (stage === "question" && round.direction !== null) return { ...state, stage: "answer" };
      break;
    case "confirm-winner":
      if (stage !== "answer" || !state.finalists.some((team) => team.teamId === command.teamId)) break;
      round.winner = command.teamId;
      return { ...state, stage: "winner" };
    case "show-wheel":
      if (stage === "winner") return { ...state, stage: "wheel" };
      break;
    case "award": {
      const index = command.round - 1;
      const target = rounds[index];
      if ((stage !== "summary" && (stage !== "wheel" || index !== questionIndex)) || !target?.winner || target.points === command.points) break;
      return { ...state, rounds: rounds.map((item, position) => index === position ? { ...item, points: command.points } : item), overallWinner: undefined };
    }
    case "next":
      if (stage !== "wheel" || round.points === undefined) break;
      return questionIndex + 1 < questions.length
        ? { ...state, stage: "question", questionIndex: questionIndex + 1 }
        : { ...state, stage: "summary" };
    case "overall-winner":
      if (stage !== "summary" || rounds.some((item) => item.points === undefined)) break;
      if (!ranking.some((team) => team.teamId === command.teamId && team.points === ranking[0].points)) {
        throw new FinaleConflict("Wybierz jedną z drużyn na pierwszym miejscu.");
      }
      return { ...state, overallWinner: command.teamId };
    case "complete": {
      if (stage !== "summary" || rounds.some((item) => item.points === undefined)) break;
      const leaders = ranking.filter((team) => team.points === ranking[0].points);
      const winner = leaders.length === 1 ? leaders[0].teamId : state.overallWinner;
      if (!winner || !leaders.some((team) => team.teamId === winner)) throw new FinaleConflict("Rozstrzygnij remis w punktacji ogólnej.");
      return { ...state, stage: "completed", finalRanking: ranking, overallWinner: winner };
    }
      break;
  }
  throw new FinaleConflict("Ta akcja jest niedostępna na tym etapie finału.");
}
