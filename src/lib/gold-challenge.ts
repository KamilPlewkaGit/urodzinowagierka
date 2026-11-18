import "server-only";

import { compareChipBalances } from "@/lib/chips";
import type { GoldProgress, GoldReward, GoldSnapshot, Player, TeamId } from "@/lib/types";

export const GOLD_CONTRIBUTION = 10;

export class GoldConflict extends Error {}

export const initialGold: GoldProgress = { stage: "intro", teams: [], representatives: [], winner: null, reward: null };

function decimal(units: bigint) {
  return `${units / 10_000n}.${String(units % 10_000n).padStart(4, "0")}`;
}

/** Mirrors the SQL order and four-decimal split for the administrator's read-only preview. */
function previewGold(teams: TeamId[], winner: TeamId, players: Player[]) {
  const losers = players.filter((player) => player.teamId !== winner && teams.includes(player.teamId));
  const winners = players.filter((player) => player.teamId === winner);
  const pool = BigInt(losers.length) * BigInt(GOLD_CONTRIBUTION) * 10_000n;
  const count = BigInt(winners.length || 1);
  const reward: GoldReward = {
    pool: decimal(pool), losingCount: losers.length,
    shares: winners.map((player, index) => ({
      playerId: player.id, nickname: player.nickname, amount: decimal(pool / count + (BigInt(index) < pool % count ? 1n : 0n)),
    })),
  };
  return { reward, shortfalls: losers.filter((player) => compareChipBalances(player.tokens, String(GOLD_CONTRIBUTION)) < 0).map((player) => player.nickname) };
}

export function getGoldSnapshot(state: GoldProgress | null, revision: string, players: Player[], votes: { candidate_id: number; votes: number; viewer_vote: boolean }[], admin: boolean): GoldSnapshot {
  const progress = state ?? initialGold;
  return {
    ...progress,
    revision,
    viewerNominationId: votes.find((row) => row.viewer_vote)?.candidate_id ?? null,
    ...(admin && progress.stage === "nominations" ? { adminNominations: Object.fromEntries(votes.map((row) => [row.candidate_id, row.votes])) } : {}),
    ...(admin && progress.stage === "live" ? { adminPreviews: Object.fromEntries(progress.teams.map((team) => [team, previewGold(progress.teams, team, players)])) } : {}),
  };
}
