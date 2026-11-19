import "server-only";

import { compareChipBalances } from "@/lib/chips";
import type { GoldProgress, GoldReward, GoldSnapshot, Player } from "@/lib/types";

export const GOLD_CONTRIBUTION = 10;
export class GoldConflict extends Error {}
export const initialGold: GoldProgress = { stage: "intro", teams: [], representatives: [], winner: null, reward: null };

export type GoldStakeView = {
  game: number;
  player_id: number;
  nickname: string;
  team_id: Player["teamId"];
  choice: number | null;
  settled_at: string | null;
};

function decimal(units: bigint) {
  return (units / 10_000n) + "." + String(units % 10_000n).padStart(4, "0");
}

export function normalizeGoldProgress(state: GoldProgress | null) {
  if (!state) return initialGold;
  if (state.stage === "live" && !state.firstEscrowId) return { ...state, stage: "contributions" as const };
  if (state.stage === "completed" && !state.sixResult) return { ...state, stage: "result" as const };
  return state;
}

export function getGoldSnapshot(
  state: GoldProgress | null, revision: string, players: Player[],
  votes: { candidate_id: number; votes: number; viewer_vote: boolean }[],
  stakes: GoldStakeView[], viewerId: number | undefined, admin: boolean,
): GoldSnapshot {
  const { firstEscrowId, sixRoundId, sixPendingNumber, ...progress } = normalizeGoldProgress(state);
  const result: GoldSnapshot = {
    ...progress,
    revision,
    viewerNominationId: votes.find((row) => row.viewer_vote)?.candidate_id ?? null,
    viewerNumber: stakes.find((row) => row.game === 2 && row.player_id === viewerId)?.choice ?? null,
    ...(firstEscrowId && progress.reward ? {
      firstContributors: stakes.filter((row) => row.game === 1).map((row) => ({ id: row.player_id, nickname: row.nickname })),
    } : {}),
  };
  if (!admin) return result;

  if (progress.stage === "nominations") {
    result.adminNominations = Object.fromEntries(votes.map((row) => [row.candidate_id, row.votes]));
  }
  if (progress.stage === "contributions") {
    const participants = players.filter((player) => progress.teams.includes(player.teamId));
    result.adminContributions = {
      players: participants.length, pool: String(participants.length * GOLD_CONTRIBUTION),
      shortfalls: participants.filter((player) => compareChipBalances(player.tokens, String(GOLD_CONTRIBUTION)) < 0)
        .map((player) => player.nickname),
    };
  }
  if (progress.stage === "live") {
    const deposits = stakes.filter((row) => row.game === 1);
    const pool = BigInt(deposits.length) * BigInt(GOLD_CONTRIBUTION) * 10_000n;
    result.adminPreviews = Object.fromEntries(progress.teams.map((team) => {
      const members = deposits.filter((row) => row.team_id === team);
      const count = BigInt(members.length || 1);
      const reward: GoldReward = {
        pool: decimal(pool), contributors: deposits.length,
        shares: members.map((row, index) => ({
          playerId: row.player_id, nickname: row.nickname,
          amount: decimal(pool / count + (BigInt(index) < pool % count ? 1n : 0n)),
        })),
      };
      return [team, reward];
    }));
  }
  if (sixRoundId) {
    const ballots = stakes.filter((row) => row.game === 2);
    result.adminNumbers = {
      votedIds: ballots.map((row) => row.player_id),
      reserved: String(ballots.filter((row) => !row.settled_at).length * GOLD_CONTRIBUTION),
      ...(progress.stage !== "six-voting" ? {
        counts: Array.from({ length: 6 }, (_, index) => ballots.filter((row) => row.choice === index + 1).length),
        pendingNumber: sixPendingNumber,
      } : {}),
    };
  }
  return result;
}
