import "server-only";

import type { AlkoholicyProgress, TeamId } from "@/lib/types";
import type { AlkoholicyAction } from "@/lib/validation";

export class AlkoholicyConflict extends Error {}

export const initialAlkoholicy: AlkoholicyProgress = {
  stage: "intro", order: [], performance: 0, scores: {}, duelTeams: null, duelIndex: 0, duelHistory: [],
};

type LegacyAlkoholicy = Omit<AlkoholicyProgress, "duelIndex" | "duelHistory"> & {
  duelResult?: { winner: TeamId; points: number } | null;
};

export function normalizeAlkoholicy(state: AlkoholicyProgress | LegacyAlkoholicy | null): AlkoholicyProgress {
  if (!state) return initialAlkoholicy;
  if ("duelIndex" in state) return state;
  const { duelResult, ...rest } = state;
  return {
    ...rest, duelIndex: 0,
    stage: duelResult && (rest.stage === "results" || rest.stage === "completed") ? "duel-result" : rest.stage,
    duelHistory: duelResult && rest.duelTeams ? [{ teams: rest.duelTeams, winner: duelResult.winner }] : [],
    legacyDuelAward: duelResult ?? undefined,
  };
}

export function charadesLeaders(state: AlkoholicyProgress) {
  if (!state.order.length || state.order.some((team) => state.scores[team] === undefined)) return [];
  const best = Math.max(...state.order.map((team) => state.scores[team]!));
  return state.order.filter((team) => state.scores[team] === best);
}

export function alkoholicyAwardedPoints(state: AlkoholicyProgress): Partial<Record<TeamId, number>> {
  const points = { ...state.scores };
  if (state.legacyDuelAward) {
    const { winner, points: award } = state.legacyDuelAward;
    points[winner] = (points[winner] ?? 0) + award;
  }
  return points;
}

export function advanceAlkoholicy(state: AlkoholicyProgress, command: Exclude<AlkoholicyAction["command"], { action: "bet" }>): AlkoholicyProgress {
  const { stage, order, performance, scores, duelTeams } = state;
  const current = order[performance];
  switch (command.action) {
    case "restart": return initialAlkoholicy;
    case "start":
      if (stage === "intro") return { ...state, stage: "order" };
      break;
    case "order":
      if (stage === "order" || stage === "charades-ready") return { ...state, order: command.teams, stage: "charades-ready" };
      break;
    case "open-charades":
      if (stage === "charades-ready") return { ...state, stage: "charades-betting" };
      break;
    case "start-charades":
      if (stage === "charades-ready" || stage === "charades-betting") return { ...state, stage: "charades-play" };
      break;
    case "score-charades":
      if (stage === "charades-play" && command.teamId === current && scores[current] === undefined) {
        return { ...state, scores: { ...scores, [current]: command.points } };
      }
      break;
    case "correct-charades":
      if ((stage === "charades-play" || stage === "charades-review") && scores[command.teamId] !== undefined) {
        return { ...state, scores: { ...scores, [command.teamId]: command.points } };
      }
      break;
    case "next-team":
      if (stage === "charades-play" && scores[current] !== undefined) {
        return performance === order.length - 1 ? { ...state, stage: "charades-review" } : { ...state, performance: performance + 1 };
      }
      break;
    case "settle-charades":
      if (stage === "charades-review") return { ...state, stage: "charades-results" };
      break;
    case "next-game":
      if (stage === "charades-results") return { ...state, stage: "duel-setup" };
      break;
    case "duel-teams":
      if (stage === "duel-setup") return { ...state, duelTeams: command.teams };
      break;
    case "open-duel":
      if (stage === "duel-setup" && duelTeams) return { ...state, stage: "duel-betting" };
      break;
    case "start-duel":
      if ((stage === "duel-setup" || stage === "duel-betting") && duelTeams) return { ...state, stage: "duel-live" };
      break;
    case "finish-duel":
      if (stage === "duel-live" && duelTeams?.includes(command.teamId)) {
        return { ...state, stage: state.duelIndex === 0 ? "duel-result" : "results",
          duelHistory: [...state.duelHistory, { teams: duelTeams, winner: command.teamId }] };
      }
      break;
    case "next-duel":
      if (stage === "duel-result" && state.duelIndex === 0) return { ...state, stage: "duel-setup", duelIndex: 1, duelTeams: null };
      break;
    case "complete":
      if (stage === "results") return { ...state, stage: "completed" };
      break;
  }
  throw new AlkoholicyConflict("Ta akcja jest niedostępna na tym etapie segmentu ALKOHOLICY.");
}
