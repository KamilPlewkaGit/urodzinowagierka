import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import { defaults, neon, type NeonQueryPromise } from "@neondatabase/serverless";

import { compareChipBalances } from "@/lib/chips";
import { CHARADES_BET_STAKE, LEGACY_DUEL_BET_STAKE, STANDARD_DUEL_BET_STAKE, STARTING_TOKENS, TEAM_IDS } from "@/lib/constants";
import { advanceAlkoholicy, alkoholicyAwardedPoints, AlkoholicyConflict, charadesLeaders, normalizeAlkoholicy } from "@/lib/alkoholicy";
import { getGoldSnapshot, GOLD_CONTRIBUTION, GoldConflict, normalizeGoldProgress, type GoldStakeView } from "@/lib/gold-challenge";
import { advanceFamiliada, FamiliadaConflict, getFamiliadaSnapshot, type FamiliadaBetSummary, type StoredFamiliada } from "@/lib/familiada";
import { advanceFinale, FinaleConflict, getFinaleSnapshot, rankFinaleTeams, type StoredFinale } from "@/lib/finale";
import type { AlkoholicyAction, FamiliadaAction, FinaleAction, GoldAction } from "@/lib/validation";
import { THE_FLOOR_CATEGORY_IDS, THE_FLOOR_DUEL_SECONDS, THE_FLOOR_PASS_PENALTY_SECONDS, THE_FLOOR_PRESENCE_SECONDS } from "@/lib/floor";
import { getTheFloorCatalogStatus, getTheFloorContent, getTheFloorDeckKeys, getTheFloorItemCounts, getTheFloorPreloadManifest } from "@/lib/floor-content";
import { SOLENIZANT_LAST_QUESTION_INDEX } from "@/lib/solenizant";
import { SPORT_BONUS_ROUND_COUNT, SPORT_CHALLENGE_COUNT, SPORT_CORRECT_BET_PROFIT, SPORT_CHALLENGES } from "@/lib/sport";
import { MELODIA_LOSER_CONTRIBUTION, MELODIA_SONG_COUNT } from "@/lib/melodia";
import { POJEDYNKI_DUEL_COUNT } from "@/lib/pojedynki";
import type { GameSnapshot, GameState, MelodiaSong, MelodiaSongStage, MelodiaStage, MelodiaState, MelodiaTeamScore, Player, PojedynkiDuel, PojedynkiDuelStage, PojedynkiStage, PojedynkiState, SegmentId, Session, SportBonusRound, SportBonusStage, SportChallenge, SportChallengeStage, SportPairing, SportPairSlot, SportPlayerNumber, SportStage, SportState, TeamId, TeamScore, TheFloorDuel, TheFloorDuelStage, TheFloorState, TheFloorStage } from "@/lib/types";
import type { TheFloorPreloadStatus, AlkoholicyBetResult, AlkoholicyMarket, AlkoholicyProgress, GoldProgress, GoldRepresentative } from "@/lib/types";

// PostgreSQL BIGSERIAL/int8 columns are player-facing identifiers in the typed
// snapshot. Neon otherwise returns int8 fields as text, which breaks the
// number-only API contract after JSON serialization.
defaults.parseInt8 = true;

type PlayerRow = {
  id: number;
  nickname: string;
  team_id: TeamId;
  tokens: string | number;
  created_at: string | Date;
};

type TotalTokensRow = { total_tokens: string | number };

type GameRow = {
  server_time_ms?: string | number;
  id: number;
  status: "waiting" | "started";
  started_at: string | Date | null;
  active_segment: SegmentId;
  solenizant_stage: "intro" | "question" | "scoring" | "results";
  current_question_index: number;
  the_floor_stage: TheFloorStage;
  current_the_floor_duel_sequence: number;
  sport_stage: SportStage;
  current_sport_challenge_sequence: number;
  current_sport_bonus_sequence: number;
  melodia_stage: MelodiaStage;
  current_melodia_song_sequence: number;
  melodia_winning_team_id: TeamId | null;
  melodia_settled_at: string | Date | null;
  melodia_pool_rule?: boolean;
  pojedynki_stage: PojedynkiStage;
  current_pojedynki_duel_sequence: number;
};

type TeamScoreRow = {
  team_id: TeamId;
  points: number;
};

type SessionRow = {
  token: string;
  role: Session["role"];
  player_id: number | null;
  expires_at: string | Date;
};

type NewSession =
  | { role: "player"; playerId: number; expiresAt: Date }
  | { role: "admin" | "observer"; expiresAt: Date };

type CompletionRow = {
  completed: boolean | "t" | "f";
};

type ChipAdjustmentRow = {
  player_id: number;
  previous_tokens: string | number;
  new_tokens: string | number;
};

type RemovedPlayerRow = {
  id: number;
  nickname: string;
};

type TheFloorDuelRow = {
  bet_stake: string | number;
  id: number;
  sequence: number;
  category_id: string;
  stage: TheFloorDuelStage;
  team_a_id: TeamId | null;
  team_b_id: TeamId | null;
  active_team_id: TeamId | null;
  item_index: number;
  item_order: string[] | null;
  settled_at: string | Date | null;
  team_a_time_seconds: number;
  team_b_time_seconds: number;
  turn_started_at: string | Date | null;
  started_at: string | Date | null;
  ended_at: string | Date | null;
  winner_team_id: TeamId | null;
};

type TheFloorBetCountRow = { duel_id: number; bet_count: number };
type TheFloorViewerBetRow = { duel_id: number; target_team_id: TeamId | null; result: "pending" | "won" | "lost" | "refunded"; payout: string | number };

type SportPairingRow = { slot: SportPairSlot; team_a_id: TeamId; team_b_id: TeamId };
type SportPlayerNumberRow = { team_id: TeamId; player_id: number; player_number: number };
type SportChallengeRow = { bet_stake: string | number; settled_at: string | Date | null; id: number; sequence: number; pair_slot: SportPairSlot; stage: SportChallengeStage; winner_team_id: TeamId | null; score_revision: string };
type SportBetCountRow = { challenge_id: number; bet_count: number };
type SportViewerBetRow = { challenge_id: number; target_team_id: TeamId | null; result: "pending" | "won" | "lost" | null; payout: string | number };
type SportBonusRow = { id: number; sequence: number; stage: SportBonusStage; winner_team_id: TeamId | null; points: number | null };
type SportBonusRequirementRow = { bonus_round_id: number; team_id: TeamId; limbs: number };
type MelodiaSongRow = { id: number; sequence: number; stage: MelodiaSongStage; winning_team_id: TeamId | null; artist_points: number | null; title_points: number | null };
type MelodiaTeamScoreRow = { team_id: TeamId; points: number };
type SnapshotQuery<Row> = NeonQueryPromise<false, false, Row[]>;
type FamiliadaRow = { familiada_state: StoredFamiliada | null; familiada_revision: string };
type FinaleRow = { finale_state: StoredFinale | null; finale_revision: string };
type AlkoholicyRow = { alkoholicy_state: AlkoholicyProgress | null; alkoholicy_revision: string };
type GoldRow = { gold_state: GoldProgress | null; gold_revision: string };
type AlkoholicyBetSummary = { game_number: number; pending: number; won: number; lost: number; refunded: number; target: TeamId | null; result: AlkoholicyBetResult | null; payout: string | null };
type GoldVoteSummary = { candidate_id: number; votes: number; viewer_vote: boolean };
type SnapshotRows<Queries extends readonly PromiseLike<unknown>[]> = { [Index in keyof Queries]: Awaited<Queries[Index]> };

type MelodiaSettlementRow = { pool: string | null; reward_min: string | null; reward_max: string | null; viewer_delta: string | null };
type PojedynkiDuelRow = { bet_stake: string | number; settled_at: string | Date | null; id: number; sequence: number; stage: PojedynkiDuelStage; team_a_id: TeamId | null; team_b_id: TeamId | null; winner_team_id: TeamId | null; score_revision: string };
type PojedynkiBetCountRow = { duel_id: number; bet_count: number };
type PojedynkiViewerBetRow = { duel_id: number; target_team_id: TeamId; result: "pending" | "won" | "lost" | "refunded"; payout: string | number };

export class NicknameTakenError extends Error {
  constructor() {
    super("Ten pseudonim jest już zajęty.");
    this.name = "NicknameTakenError";
  }
}

let schemaPromise: Promise<void> | undefined;

function database() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return neon(connectionString);
}

async function runWithGameLock(sql: ReturnType<typeof database>, query: NeonQueryPromise<false, false>) {
  // Acquire the shared lock before taking the write statement's snapshot.
  const [, rows] = await sql.transaction([sql`SELECT id FROM game_state WHERE id = 1 FOR UPDATE`, query]);
  return rows;
}

function overallTeamScores(sql: ReturnType<typeof database>) {
  return sql`
    WITH victories AS (
      SELECT winner_team_id AS team_id FROM the_floor_duels WHERE settled_at IS NOT NULL
      UNION ALL
      SELECT winner_team_id FROM pojedynki_duels WHERE settled_at IS NOT NULL
      UNION ALL
      SELECT winner_team_id FROM sport_challenges WHERE settled_at IS NOT NULL
      UNION ALL
      SELECT match->>'winner' FROM game_state game
      CROSS JOIN LATERAL jsonb_array_elements(game.familiada_state->'matches') match
      WHERE game.id = 1 AND match->>'settledAt' IS NOT NULL
      UNION ALL
      SELECT COALESCE(gold_state->>'firstScoreTeam', gold_state->'winner'->>'teamId') FROM game_state
      WHERE id = 1 AND gold_state->>'reward' IS NOT NULL
      UNION ALL
      SELECT stake.team_id FROM game_state game
      JOIN gold_stakes stake ON stake.round_id = (game.gold_state->>'sixRoundId')::UUID
        AND stake.choice = COALESCE(game.gold_state->'sixResult'->>'scoreNumber', game.gold_state->'sixResult'->>'number')::SMALLINT
      WHERE game.id = 1 AND stake.game_number = 2 AND stake.settled_at IS NOT NULL
    ), earned AS (
      SELECT team_id, COUNT(*) AS points FROM victories GROUP BY team_id
    )
    SELECT score.team_id, score.points + COALESCE(earned.points, 0) AS points
    FROM solenizant_team_scores score LEFT JOIN earned USING (team_id)
  `;
}

function teamBetAllocations(sql: ReturnType<typeof database>) {
  return sql`
    totals AS (
      SELECT COALESCE(SUM(bet.stake), 0)::NUMERIC AS escrow,
        COALESCE(SUM(bet.stake) FILTER (WHERE bet.target_team_id IS DISTINCT FROM candidate.winner), 0)::NUMERIC AS lost_stakes,
        COUNT(*) FILTER (WHERE bet.target_team_id = candidate.winner) * ${SPORT_CORRECT_BET_PROFIT}::NUMERIC AS profit_due
      FROM bets bet CROSS JOIN candidate
    ),
    locked_players AS (
      SELECT player.id, player.team_id, player.tokens, player.created_at, player.active
      FROM players player CROSS JOIN candidate
      WHERE (player.active AND player.team_id IN (candidate.winner, candidate.loser))
        OR player.id IN (SELECT bettor_id FROM bets WHERE target_team_id = candidate.winner)
      ORDER BY player.id FOR UPDATE OF player
    ),
    ranked_members AS (
      SELECT locked_players.id, team_id,
        ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at, locked_players.id) AS member_rank,
        COUNT(*) OVER (PARTITION BY team_id) AS team_size
      FROM locked_players CROSS JOIN candidate
      WHERE active AND team_id IN (candidate.winner, candidate.loser)
    ),
    shares AS (
      SELECT member.*, CASE WHEN member.team_id = candidate.winner THEN totals.lost_stakes ELSE -totals.profit_due END AS team_delta
      FROM ranked_members member CROSS JOIN candidate CROSS JOIN totals
    ),
    movements AS (
      SELECT id AS player_id,
        TRUNC(team_delta / team_size, 4) +
          CASE WHEN member_rank <= MOD(ABS(team_delta) * 10000, team_size::NUMERIC)
            THEN SIGN(team_delta) * 0.0001 ELSE 0 END AS delta,
        CASE WHEN team_delta < 0 THEN 'zysk_dla_trafnych_typów' ELSE 'stawki_błędnych_typów' END AS kind
      FROM shares
      UNION ALL
      SELECT bet.bettor_id, bet.stake + ${SPORT_CORRECT_BET_PROFIT}::NUMERIC, 'prawidłowy_typ'
      FROM bets bet CROSS JOIN candidate WHERE bet.target_team_id = candidate.winner
    ),
    allocations AS (
      SELECT player_id, SUM(delta) AS delta FROM movements GROUP BY player_id
    ),
    outcome AS (
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'conflict'
        WHEN (lost_stakes > 0 AND NOT EXISTS (
          SELECT 1 FROM ranked_members CROSS JOIN candidate WHERE team_id = candidate.winner
        )) OR (profit_due > 0 AND NOT EXISTS (
          SELECT 1 FROM ranked_members CROSS JOIN candidate WHERE team_id = candidate.loser
        )) THEN 'empty-roster'
        WHEN EXISTS (
          SELECT 1 FROM allocations JOIN locked_players ON locked_players.id = allocations.player_id
          WHERE locked_players.tokens + allocations.delta < 0
        ) THEN 'insufficient'
        WHEN EXISTS (
          SELECT 1 FROM allocations JOIN locked_players ON locked_players.id = allocations.player_id
          WHERE locked_players.tokens + allocations.delta > 9999999999999999.9999
        ) THEN 'balance-limit'
        WHEN (SELECT COALESCE(SUM(delta), 0) FROM allocations) <> escrow THEN 'conflict'
        ELSE 'settled'
      END AS status FROM totals
    )
  `;
}

type TeamBetSettlement = "settled" | "conflict" | "empty-roster" | "insufficient" | "balance-limit";

export function getTeamBetSettlementError(status: Exclude<TeamBetSettlement, "settled">) {
  switch (status) {
    case "empty-roster": return "Nie można rozliczyć zakładów. Drużyna potrzebna do transferu nie ma aktywnych graczy.";
    case "insufficient": return "Nie można rozliczyć zakładów. Co najmniej jeden gracz przegranej drużyny ma za mało żetonów. Skoryguj saldo w panelu i ponów zatwierdzenie.";
    case "balance-limit": return "Nie można rozliczyć zakładów. Wypłata przekroczyłaby maksymalne saldo gracza.";
    default: return "Nie można teraz zatwierdzić wyniku lub rozliczyć zakładów.";
  }
}

const standardBetMarkets = {
  "the-floor": { duels: "the_floor_duels", bets: "the_floor_bets", key: "duel_id", stage: "the_floor_stage", sequence: "current_the_floor_duel_sequence", prefix: "the_floor" },
  pojedynki: { duels: "pojedynki_duels", bets: "pojedynki_bets", key: "duel_id", stage: "pojedynki_stage", sequence: "current_pojedynki_duel_sequence", prefix: "pojedynki" },
  sport: { duels: "sport_challenges", bets: "sport_bets", key: "challenge_id", stage: "sport_stage", sequence: "current_sport_challenge_sequence", prefix: "sport" },
} as const;

async function settleStandardTeamDuel(segment: keyof typeof standardBetMarkets, winner: TeamId, eventId?: number): Promise<TeamBetSettlement> {
  await ensureDatabase();
  const sql = database();
  const market = standardBetMarkets[segment];
  // Identifiers come exclusively from the three private market definitions.
  const duels = sql.unsafe(market.duels);
  const bets = sql.unsafe(market.bets);
  const key = sql.unsafe(market.key);
  const stage = sql.unsafe(market.stage);
  const sequence = sql.unsafe(market.sequence);
  const teams = sql.unsafe(segment === "sport" ? "pairing" : "duel");
  const joinPair = segment === "sport" ? sql`JOIN sport_pairings pairing ON pairing.slot = duel.pair_slot` : sql``;
  const stageFilter = segment === "the-floor" ? sql`= 'result'` : sql`IN ('live', 'result')`;
  const sportLedger = segment === "sport" ? sql`
    sport_ledger AS (
      INSERT INTO sport_chip_transfers (challenge_id, player_id, direction, amount, kind)
      SELECT marked.id, player_id, CASE WHEN delta < 0 THEN 'debit' ELSE 'credit' END, ABS(delta), kind
      FROM movements CROSS JOIN marked WHERE delta <> 0
    ),
  ` : sql``;
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT duel.id, ${winner}::TEXT AS winner,
        CASE WHEN ${winner} = ${teams}.team_a_id THEN ${teams}.team_b_id ELSE ${teams}.team_a_id END AS loser
      FROM ${duels} duel
      JOIN game_state game ON game.${sequence} = duel.sequence
      ${joinPair}
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = ${segment}
        AND game.${stage} ${stageFilter} AND duel.stage ${stageFilter}
        ${segment === "the-floor" ? sql`` : sql`AND duel.id = ${eventId}::BIGINT`}
        AND ${winner} IN (${teams}.team_a_id, ${teams}.team_b_id)
        AND (duel.winner_team_id IS NULL OR duel.winner_team_id = ${winner}) AND duel.settled_at IS NULL
      FOR UPDATE OF duel
    ), bets AS (
      SELECT bet.id, bet.bettor_id, bet.target_team_id, bet.stake
      FROM ${bets} bet JOIN candidate ON candidate.id = bet.${key}
      WHERE bet.result = 'pending'
    ),
    ${teamBetAllocations(sql)},
    marked AS (
      UPDATE ${duels} duel
      SET stage = 'result', winner_team_id = candidate.winner, ended_at = COALESCE(duel.ended_at, NOW()), settled_at = NOW()
      FROM candidate CROSS JOIN outcome WHERE duel.id = candidate.id AND outcome.status = 'settled'
      RETURNING duel.id
    ), settled_bets AS (
      UPDATE ${bets} bet
      SET result = CASE WHEN bets.target_team_id = candidate.winner THEN 'won' ELSE 'lost' END,
        payout = CASE WHEN bets.target_team_id = candidate.winner THEN bets.stake + ${SPORT_CORRECT_BET_PROFIT}::NUMERIC ELSE 0 END,
        settled_at = NOW()
      FROM bets CROSS JOIN candidate CROSS JOIN marked WHERE bet.id = bets.id
    ), paid AS (
      UPDATE players player SET tokens = player.tokens + allocations.delta
      FROM allocations CROSS JOIN marked WHERE player.id = allocations.player_id AND allocations.delta <> 0
      RETURNING player.id, allocations.delta
    ), advanced AS (
      UPDATE game_state SET ${stage} = 'result' WHERE id = 1 AND EXISTS (SELECT 1 FROM marked)
    ),
    ${sportLedger}
    audit AS (
      INSERT INTO admin_actions (action, details)
      SELECT ${market.prefix + "_bets_settled"}, jsonb_build_object(
        ${segment === "sport" ? "challengeId" : "duelId"}::TEXT, marked.id, 'winnerTeamId', ${winner}::TEXT,
        'escrow', totals.escrow, 'transfers', COALESCE((SELECT jsonb_object_agg(id, delta) FROM paid), '{}'::JSONB)
      ) FROM marked CROSS JOIN totals
    )
    SELECT status FROM outcome
  `) as { status: TeamBetSettlement }[];
  return rows[0].status;
}

export async function correctStandardTeamWinner(segment: "sport" | "pojedynki", input: { eventId: number; winnerTeamId: TeamId; correctionRevision: string }) {
  await ensureDatabase();
  const sql = database();
  const duels = sql.unsafe(standardBetMarkets[segment].duels);
  const teams = sql.unsafe(segment === "sport" ? "pairing" : "duel");
  const joinPair = segment === "sport" ? sql`JOIN sport_pairings pairing ON pairing.slot = duel.pair_slot` : sql``;
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT duel.id, duel.winner_team_id AS previous_winner
      FROM ${duels} duel ${joinPair} CROSS JOIN game_state game
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = ${segment}
        AND duel.id = ${input.eventId} AND duel.settled_at IS NOT NULL AND duel.score_revision = ${input.correctionRevision}::UUID
        AND ${input.winnerTeamId} IN (${teams}.team_a_id, ${teams}.team_b_id)
    ), corrected AS (
      UPDATE ${duels} duel SET winner_team_id = ${input.winnerTeamId}, score_revision = gen_random_uuid()
      FROM candidate WHERE duel.id = candidate.id
      RETURNING duel.id, candidate.previous_winner, duel.winner_team_id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'team_score_corrected', jsonb_build_object('segment', ${segment}::TEXT, 'eventId', id,
      'previousWinner', previous_winner, 'winnerTeamId', winner_team_id)
    FROM corrected RETURNING id
  `);
  return rows.length > 0;
}

async function placeAlkoholicyBet(sql: ReturnType<typeof database>, revision: string, bettorId: number, gameNumber: 1 | 2 | 3, target: TeamId) {
  return runWithGameLock(sql, sql`
    WITH market AS (
      SELECT alkoholicy_state, CASE WHEN ${gameNumber}::INTEGER = 1 THEN ${CHARADES_BET_STAKE}::NUMERIC
        ELSE COALESCE((alkoholicy_state->'duelBetStakes'->>(${gameNumber}::INTEGER - 2))::NUMERIC, ${LEGACY_DUEL_BET_STAKE}::NUMERIC) END AS stake
      FROM game_state WHERE id = 1 AND status = 'started' AND active_segment = 'alkoholicy'
        AND alkoholicy_revision = ${revision}::UUID
    ), debited AS (
      UPDATE players player SET tokens = player.tokens - game.stake
      FROM market game
      WHERE player.id = ${bettorId} AND player.active AND player.tokens >= game.stake
        AND (
          (${gameNumber}::INTEGER = 1 AND game.alkoholicy_state->>'stage' = 'charades-betting' AND player.team_id <> ${target})
          OR (${gameNumber}::INTEGER = 2 + COALESCE((game.alkoholicy_state->>'duelIndex')::INTEGER, 0)
            AND game.alkoholicy_state->>'stage' = 'duel-betting'
            AND (game.alkoholicy_state->'duelTeams') ? ${target}::TEXT
            AND NOT ((game.alkoholicy_state->'duelTeams') ? player.team_id))
        )
        AND NOT EXISTS (SELECT 1 FROM alkoholicy_bets WHERE game_number = ${gameNumber} AND bettor_id = player.id)
      RETURNING player.id, game.stake
    )
    INSERT INTO alkoholicy_bets (game_number, bettor_id, target_team_id, stake)
    SELECT ${gameNumber}::SMALLINT, id, ${target}, stake FROM debited
    RETURNING id
  `);
}

async function saveAlkoholicyProgress(sql: ReturnType<typeof database>, revision: string, current: AlkoholicyProgress, next: AlkoholicyProgress, restart: boolean) {
  const previous = alkoholicyAwardedPoints(current);
  const awarded = alkoholicyAwardedPoints(next);
  const deltas = Object.fromEntries(TEAM_IDS.map((team) => [team, (awarded[team] ?? 0) - (previous[team] ?? 0)]));
  return runWithGameLock(sql, sql`
    WITH point_changes AS (
      SELECT score.team_id, GREATEST(0, score.points::BIGINT + change.value::BIGINT) AS new_points
      FROM solenizant_team_scores score JOIN jsonb_each_text(${JSON.stringify(deltas)}::JSONB) change ON change.key = score.team_id
      WHERE change.value::BIGINT <> 0
      FOR UPDATE OF score
    ), saved AS (
      UPDATE game_state
      SET alkoholicy_state = ${restart ? null : JSON.stringify(next)}::JSONB, alkoholicy_revision = gen_random_uuid()
      WHERE id = 1 AND status = 'started' AND active_segment = 'alkoholicy' AND alkoholicy_revision = ${revision}::UUID
        AND NOT EXISTS (SELECT 1 FROM point_changes WHERE new_points > 2147483647)
      RETURNING id
    ), scored AS (
      UPDATE solenizant_team_scores score SET points = change.new_points
      FROM point_changes change CROSS JOIN saved WHERE score.team_id = change.team_id
    ), cleared_bets AS (
      DELETE FROM alkoholicy_bets WHERE ${restart}::BOOLEAN AND EXISTS (SELECT 1 FROM saved)
      RETURNING bettor_id, stake, result
    ), refunds AS (
      SELECT bettor_id, SUM(stake) AS amount FROM cleared_bets WHERE result = 'pending' GROUP BY bettor_id
    ), refunded AS (
      UPDATE players player SET tokens = player.tokens + refunds.amount FROM refunds WHERE player.id = refunds.bettor_id
    )
    SELECT id FROM saved
  `);
}

/** Kalambury retains its closed pot and tie refunds. The duel uses the shared team settlement. */
async function settleAlkoholicy(sql: ReturnType<typeof database>, revision: string, next: AlkoholicyProgress, gameNumber: 1 | 2 | 3, winner: TeamId | null) {
  const duel = gameNumber !== 1;
  const loser = duel ? next.duelTeams?.find((team) => team !== winner) ?? null : null;
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT id, ${winner}::TEXT AS winner, ${loser}::TEXT AS loser
      FROM game_state WHERE id = 1 AND status = 'started' AND active_segment = 'alkoholicy'
        AND alkoholicy_revision = ${revision}::UUID
    ), bets AS (
      SELECT bet.* FROM alkoholicy_bets bet CROSS JOIN candidate
      WHERE bet.game_number = ${gameNumber} AND bet.result = 'pending'
    ), wager_totals AS (
      SELECT COALESCE(SUM(stake), 0) AS pot, COUNT(*) FILTER (WHERE target_team_id = ${winner}) AS correct,
        MIN(id) FILTER (WHERE target_team_id = ${winner}) AS first_correct,
        COALESCE(SUM(stake) FILTER (WHERE target_team_id <> ${winner}), 0) AS lost_stakes
      FROM bets
    ), wager_amounts AS (
      SELECT bet.id,
        CASE WHEN NOT ${duel}::BOOLEAN AND totals.correct = 0 THEN 'refunded'
          WHEN bet.target_team_id = ${winner} THEN 'won' ELSE 'lost' END AS result,
        CASE WHEN NOT ${duel}::BOOLEAN AND totals.correct = 0 THEN bet.stake
          WHEN bet.target_team_id <> ${winner} THEN 0::NUMERIC
          WHEN ${duel}::BOOLEAN THEN bet.stake + ${SPORT_CORRECT_BET_PROFIT}::NUMERIC
          ELSE TRUNC(totals.pot / NULLIF(totals.correct, 0), 4) + CASE WHEN bet.id = totals.first_correct
            THEN totals.pot - TRUNC(totals.pot / NULLIF(totals.correct, 0), 4) * totals.correct ELSE 0 END
        END AS payout
      FROM bets bet CROSS JOIN wager_totals totals
    ),

    ${duel ? teamBetAllocations(sql) : sql`
      allocations AS (
        SELECT bet.bettor_id AS player_id, wager.payout AS delta
        FROM bets bet JOIN wager_amounts wager ON wager.id = bet.id WHERE wager.payout > 0
      ), locked_players AS (
        SELECT player.id, player.tokens FROM players player JOIN allocations ON allocations.player_id = player.id
        ORDER BY player.id FOR UPDATE OF player
      ), outcome AS (
        SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'conflict'
          WHEN EXISTS (
            SELECT 1 FROM allocations JOIN locked_players ON locked_players.id = allocations.player_id
            WHERE locked_players.tokens + allocations.delta > 9999999999999999.9999
          ) THEN 'balance-limit' ELSE 'settled' END AS status
      )
    `},
    approved AS (
      SELECT candidate.id FROM candidate CROSS JOIN outcome
      WHERE outcome.status = 'settled'
    ), settled AS (
      UPDATE alkoholicy_bets bet SET result = wager.result, payout = wager.payout, settled_at = NOW()
      FROM wager_amounts wager CROSS JOIN approved WHERE bet.id = wager.id
    ), paid AS (
      UPDATE players player SET tokens = player.tokens + allocations.delta
      FROM allocations CROSS JOIN approved WHERE player.id = allocations.player_id AND allocations.delta <> 0
      RETURNING player.id, allocations.delta
    ), saved AS (
      UPDATE game_state game SET alkoholicy_state = ${JSON.stringify(next)}::JSONB, alkoholicy_revision = gen_random_uuid()
      FROM approved WHERE game.id = approved.id RETURNING game.id
    ), audited AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'alkoholicy_settlement', jsonb_build_object('game', ${gameNumber}::INTEGER, 'winner', ${winner}::TEXT,
        'transfers', COALESCE((SELECT jsonb_object_agg(id, delta) FROM paid), '{}'::JSONB))
      FROM saved
    )
    SELECT CASE WHEN status = 'settled' AND NOT EXISTS (SELECT 1 FROM saved) THEN 'conflict' ELSE status END AS status FROM outcome
  `) as { status: TeamBetSettlement }[];
  return rows[0].status;
}

export async function applyAlkoholicyAction({ revision, command }: AlkoholicyAction, bettorId?: number) {
  await ensureDatabase();
  const sql = database();
  const stale = "Stan segmentu ALKOHOLICY się zmienił. Odśwież widok i ponów akcję.";
  if (command.action === "bet") {
    if (bettorId === undefined || !(await placeAlkoholicyBet(sql, revision, bettorId, command.game, command.teamId)).length) {
      throw new AlkoholicyConflict("Nie możesz postawić zakładu. Sprawdź etap gry, swoją drużynę, saldo i wcześniejszy zakład.");
    }
    return;
  }
  const [row] = await sql`
    SELECT alkoholicy_state, alkoholicy_revision FROM game_state
    WHERE id = 1 AND status = 'started' AND active_segment = 'alkoholicy'
  ` as AlkoholicyRow[];
  if (!row || row.alkoholicy_revision !== revision) throw new AlkoholicyConflict(stale);
  const current = normalizeAlkoholicy(row.alkoholicy_state);
  const next = advanceAlkoholicy(current, command);
  if (command.action === "settle-charades") {
    const leaders = charadesLeaders(next);
    if (!leaders.length || (await settleAlkoholicy(sql, revision, next, 1, leaders.length === 1 ? leaders[0] : null)) !== "settled") {
      throw new AlkoholicyConflict("Nie udało się rozliczyć Kalamburów. Sprawdź wyniki i aktualne salda graczy.");
    }
  } else if (command.action === "finish-duel") {
    const status = await settleAlkoholicy(sql, revision, next, next.duelIndex === 0 ? 2 : 3, command.teamId);
    if (status !== "settled") throw new AlkoholicyConflict(getTeamBetSettlementError(status));
  } else if (!(await saveAlkoholicyProgress(sql, revision, current, next, command.action === "restart")).length) {
    throw new AlkoholicyConflict("Stan segmentu się zmienił lub punktacja przekroczyłaby dopuszczalną wartość.");
  }
}

async function nominateGoldRepresentative(sql: ReturnType<typeof database>, revision: string, voterId: number, candidateId: number) {
  return runWithGameLock(sql, sql`
    WITH eligible AS (
      SELECT voter.id AS voter_id, candidate.id AS candidate_id
      FROM players voter JOIN players candidate ON candidate.team_id = voter.team_id
      CROSS JOIN game_state game
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'gold-challenge'
        AND game.gold_revision = ${revision}::UUID AND game.gold_state->>'stage' = 'nominations'
        AND (game.gold_state->'teams') ? voter.team_id
        AND voter.id = ${voterId} AND candidate.id = ${candidateId} AND voter.active AND candidate.active
      FOR UPDATE OF voter, candidate
    )
    INSERT INTO gold_nominations (voter_id, candidate_id)
    SELECT voter_id, candidate_id FROM eligible
    ON CONFLICT (voter_id) DO UPDATE SET candidate_id = EXCLUDED.candidate_id
    RETURNING voter_id
  `);
}

async function saveGoldProgress(sql: ReturnType<typeof database>, revision: string, next: GoldProgress | null, requiredReps: GoldRepresentative[] = [], restartEscrow?: string) {
  return runWithGameLock(sql, sql`
    WITH available AS (
      SELECT player.id FROM players player
      JOIN jsonb_to_recordset(${JSON.stringify(requiredReps)}::JSONB) AS rep(id BIGINT, "teamId" TEXT)
        ON player.id = rep.id AND player.team_id = rep."teamId"
      WHERE player.active ORDER BY player.id FOR UPDATE OF player
    ), saved AS (
      UPDATE game_state SET gold_state = ${next === null ? null : JSON.stringify(next)}::JSONB, gold_revision = gen_random_uuid()
      WHERE id = 1 AND status = 'started' AND active_segment = 'gold-challenge' AND gold_revision = ${revision}::UUID
        AND (SELECT COUNT(*) FROM available) = ${requiredReps.length}::INTEGER
      RETURNING id
    ), cleared AS (
      DELETE FROM gold_nominations WHERE ${next === null}::BOOLEAN AND EXISTS (SELECT 1 FROM saved)
    ), returned AS (
      UPDATE gold_stakes AS stake SET payout = stake.stake, settled_at = NOW()
      WHERE stake.round_id = ${restartEscrow ?? null}::UUID AND stake.settled_at IS NULL AND EXISTS (SELECT 1 FROM saved)
      RETURNING stake.player_id, stake.stake
    ), refunded AS (
      UPDATE players player SET tokens = player.tokens + returned.stake
      FROM returned WHERE player.id = returned.player_id RETURNING player.id, player.tokens, returned.stake
    ), ledger AS (
      INSERT INTO gold_chip_transfers (settlement_id, player_id, previous_tokens, new_tokens, delta)
      SELECT ${revision}::UUID, id, tokens - stake, tokens, stake FROM refunded
    )
    SELECT id FROM saved
  `);
}


async function collectGoldContributions(sql: ReturnType<typeof database>, revision: string, state: GoldProgress) {
  const round = randomUUID();
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT id FROM game_state WHERE id = 1 AND status = 'started' AND active_segment = 'gold-challenge'
        AND gold_revision = ${revision}::UUID AND gold_state->>'stage' IN ('contributions', 'live')
        AND gold_state->>'firstEscrowId' IS NULL
    ), roster AS (
      SELECT player.id, player.team_id, player.nickname, player.tokens
      FROM players player CROSS JOIN candidate
      WHERE player.active AND player.team_id = ANY(${state.teams}::TEXT[])
      ORDER BY player.id FOR UPDATE OF player
    ), shortfall AS (
      SELECT nickname FROM roster WHERE tokens < ${GOLD_CONTRIBUTION}::NUMERIC ORDER BY id LIMIT 1
    ), saved AS (
      UPDATE game_state game SET gold_state = ${JSON.stringify({ ...state, stage: "live", firstEscrowId: round })}::JSONB, gold_revision = gen_random_uuid()
      FROM candidate WHERE game.id = candidate.id AND NOT EXISTS (SELECT 1 FROM shortfall)
        AND (SELECT COUNT(*) FROM roster WHERE id = ANY(${state.representatives.map((rep) => rep.id)}::BIGINT[])) = ${state.teams.length}
      RETURNING game.id
    ), debits AS (
      UPDATE players player SET tokens = player.tokens - ${GOLD_CONTRIBUTION}::NUMERIC
      FROM roster CROSS JOIN saved WHERE player.id = roster.id
      RETURNING player.id, player.team_id, roster.tokens AS previous_tokens, player.tokens AS new_tokens
    ), reserved AS (
      INSERT INTO gold_stakes (round_id, game_number, player_id, team_id, stake)
      SELECT ${round}::UUID, 1, id, team_id, ${GOLD_CONTRIBUTION}::NUMERIC FROM debits
    ), ledger AS (
      INSERT INTO gold_chip_transfers (settlement_id, player_id, previous_tokens, new_tokens, delta)
      SELECT ${round}::UUID, id, previous_tokens, new_tokens, -${GOLD_CONTRIBUTION}::NUMERIC FROM debits
    )
    SELECT EXISTS (SELECT 1 FROM saved) AS completed, (SELECT nickname FROM shortfall) AS shortfall
  `) as (CompletionRow & { shortfall: string | null })[];
  if (rows[0].completed === true || rows[0].completed === "t") return;
  if (rows[0].shortfall) throw new GoldConflict('Gracz „' + rows[0].shortfall + '” ma mniej niż 10 żetonów.');
  throw new GoldConflict("Sprawdź, czy każda uczestnicząca drużyna ma aktywnego przedstawiciela.");
}

async function voteGoldNumber(sql: ReturnType<typeof database>, revision: string, voterId: number, choice: number) {
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT (gold_state->>'sixRoundId')::UUID AS round_id FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'gold-challenge'
        AND gold_revision = ${revision}::UUID AND gold_state->>'stage' = 'six-voting'
    ), debited AS (
      UPDATE players player SET tokens = player.tokens - ${GOLD_CONTRIBUTION}::NUMERIC
      FROM candidate WHERE player.id = ${voterId} AND player.active AND player.tokens >= ${GOLD_CONTRIBUTION}::NUMERIC
        AND NOT EXISTS (SELECT 1 FROM gold_stakes WHERE round_id = candidate.round_id AND player_id = player.id)
      RETURNING player.id, player.team_id, player.tokens, candidate.round_id
    ), reserved AS (
      INSERT INTO gold_stakes (round_id, game_number, player_id, team_id, choice, stake)
      SELECT round_id, 2, id, team_id, ${choice}::SMALLINT, ${GOLD_CONTRIBUTION}::NUMERIC FROM debited
    )
    INSERT INTO gold_chip_transfers (settlement_id, player_id, previous_tokens, new_tokens, delta)
    SELECT round_id, id, tokens + ${GOLD_CONTRIBUTION}::NUMERIC, tokens, -${GOLD_CONTRIBUTION}::NUMERIC FROM debited
    RETURNING player_id
  `);
  if (!rows.length) throw new GoldConflict("Głosowanie jest zamknięte, głos już zapisano lub masz mniej niż 10 żetonów.");
}

async function settleGoldEscrow(sql: ReturnType<typeof database>, revision: string, state: GoldProgress, winner?: GoldRepresentative) {
  const numbers = !winner;
  const number = state.sixPendingNumber ?? null;
  const round = numbers ? state.sixRoundId : state.firstEscrowId;
  if (!round) throw new GoldConflict("Nie znaleziono zapisanej puli.");
  const next = { ...state, stage: numbers ? "six-result" : "result", winner: winner ?? state.winner, sixPendingNumber: undefined };
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT id FROM game_state WHERE id = 1 AND status = 'started' AND active_segment = 'gold-challenge'
        AND gold_revision = ${revision}::UUID AND gold_state->>'stage' = ${state.stage}
    ), ballots AS (
      SELECT stake.round_id, stake.player_id, stake.stake, player.nickname, player.tokens,
        CASE WHEN ${numbers}::BOOLEAN THEN stake.choice = ${number}::SMALLINT ELSE stake.team_id = ${winner?.teamId ?? null}::TEXT END AS correct
      FROM gold_stakes stake JOIN players player ON player.id = stake.player_id CROSS JOIN candidate
      WHERE stake.round_id = ${round}::UUID AND stake.settled_at IS NULL
      ORDER BY player.id FOR UPDATE OF player
    ), totals AS (
      SELECT COUNT(*) AS voters, COUNT(*) FILTER (WHERE correct) AS winners,
        COALESCE(SUM(stake), 0) AS escrow,
        COALESCE(SUM(stake) FILTER (WHERE NOT correct), 0) AS incorrect_pool
      FROM ballots
    ), ranked AS (
      SELECT ballots.*, ROW_NUMBER() OVER (PARTITION BY correct ORDER BY player_id) AS position FROM ballots
    ), split AS (
      SELECT totals.*, CASE WHEN ${numbers}::BOOLEAN THEN incorrect_pool ELSE escrow END AS prize
      FROM totals
    ), shares AS (
      SELECT split.*, TRUNC(prize / NULLIF(winners, 0), 4) AS base FROM split
    ), allocations AS (
      SELECT ranked.*, CASE
        WHEN ${numbers}::BOOLEAN AND shares.winners = 0 THEN stake
        WHEN NOT correct THEN 0::NUMERIC
        ELSE base + CASE WHEN position <= (prize - base * winners) * 10000 THEN 0.0001 ELSE 0 END
          + CASE WHEN ${numbers}::BOOLEAN THEN stake ELSE 0 END
      END AS payout
      FROM ranked CROSS JOIN shares
    ), approved AS (
      SELECT candidate.id FROM candidate CROSS JOIN shares
      WHERE (${numbers}::BOOLEAN OR shares.winners > 0)
        AND NOT EXISTS (SELECT 1 FROM allocations WHERE tokens + payout > 9999999999999999.9999)
        AND (SELECT COALESCE(SUM(payout), 0) FROM allocations) = shares.escrow
    ), paid AS (
      UPDATE players player SET tokens = player.tokens + allocations.payout
      FROM allocations CROSS JOIN approved WHERE player.id = allocations.player_id AND allocations.payout > 0
      RETURNING player.id, player.tokens AS new_tokens, allocations.tokens AS previous_tokens, allocations.payout
    ), ledger AS (
      INSERT INTO gold_chip_transfers (settlement_id, player_id, previous_tokens, new_tokens, delta)
      SELECT ${revision}::UUID, id, previous_tokens, new_tokens, payout FROM paid
    ), cleared AS (
      UPDATE gold_stakes stake SET payout = allocations.payout, settled_at = NOW()
      FROM allocations CROSS JOIN approved WHERE (stake.round_id, stake.player_id) = (allocations.round_id, allocations.player_id)
    ), saved AS (
      UPDATE game_state game SET gold_revision = gen_random_uuid(), gold_state = ${JSON.stringify(next)}::JSONB ||
        CASE WHEN ${numbers}::BOOLEAN THEN jsonb_build_object('sixResult', jsonb_build_object(
          'number', ${number}::SMALLINT, 'correct', shares.winners, 'incorrect', shares.voters - shares.winners,
          'pool', CASE WHEN shares.winners = 0 THEN '0' ELSE shares.prize::TEXT END, 'void', shares.winners = 0,
          'transfers', COALESCE((SELECT jsonb_agg(jsonb_build_object('playerId', player_id, 'nickname', nickname,
            'correct', correct, 'delta', (payout - stake)::TEXT) ORDER BY player_id) FROM allocations), '[]'::JSONB)
        )) ELSE jsonb_build_object('reward', jsonb_build_object(
          'pool', shares.prize::TEXT, 'contributors', shares.voters,
          'shares', (SELECT jsonb_agg(jsonb_build_object('playerId', player_id, 'nickname', nickname, 'amount', payout::TEXT) ORDER BY player_id)
            FROM allocations WHERE correct)
        )) END
      FROM approved CROSS JOIN shares WHERE game.id = approved.id RETURNING game.id
    ), audit AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'gold_escrow_settled', jsonb_build_object('roundId', ${round}::UUID, 'settlementId', ${revision}::UUID) FROM saved
    )
    SELECT EXISTS (SELECT 1 FROM saved) AS completed
  `) as CompletionRow[];
  if (rows[0].completed !== true && rows[0].completed !== "t") {
    throw new GoldConflict("Nie udało się rozliczyć puli. Sprawdź aktualny etap i czy wypłata mieści się w limicie salda.");
  }
}

export async function applyGoldAction({ revision, command }: GoldAction, voterId?: number) {
  await ensureDatabase();
  const sql = database();
  if (command.action === "number-vote") {
    if (voterId === undefined) throw new GoldConflict("Tylko gracz może zagłosować.");
    return voteGoldNumber(sql, revision, voterId, command.number);
  }
  const stale = "Stan złotego wyzwania się zmienił. Sprawdź obecny etap i ponów akcję.";
  if (command.action === "nominate") {
    if (voterId === undefined || !(await nominateGoldRepresentative(sql, revision, voterId, command.playerId)).length) {
      throw new GoldConflict("Możesz głosować podczas nominacji wyłącznie na aktywnego członka swojej uczestniczącej drużyny.");
    }
    return;
  }
  const [row] = await sql`
    SELECT gold_state, gold_revision FROM game_state
    WHERE id = 1 AND status = 'started' AND active_segment = 'gold-challenge'
  ` as GoldRow[];
  if (!row || row.gold_revision !== revision) throw new GoldConflict(stale);
  const state = normalizeGoldProgress(row.gold_state);
  let next: GoldProgress | null;
  let required: GoldRepresentative[] = [];
  switch (command.action) {
    case "teams":
      if (state.stage !== "intro") throw new GoldConflict(stale);
      next = { ...state, stage: "nominations", teams: command.teams };
      break;
    case "representative": {
      if (state.stage !== "nominations") throw new GoldConflict(stale);
      const [player] = await sql`SELECT id, nickname, team_id AS "teamId" FROM players WHERE id = ${command.playerId} AND active` as GoldRepresentative[];
      if (!player || !state.teams.includes(player.teamId)) throw new GoldConflict("Wybierz aktywnego zawodnika z uczestniczącej drużyny.");
      required = [player];
      next = { ...state, representatives: [...state.representatives.filter((rep) => rep.teamId !== player.teamId), player] };
      break;
    }
    case "prepare":
      if (state.stage !== "nominations" || !state.teams.every((team) => state.representatives.some((rep) => rep.teamId === team))) {
        throw new GoldConflict("Każda uczestnicząca drużyna musi mieć zatwierdzonego przedstawiciela.");
      }
      required = state.representatives;
      next = { ...state, stage: "contributions" };
      break;
    case "start":
      if (state.stage !== "contributions") throw new GoldConflict(stale);
      return collectGoldContributions(sql, revision, state);
    case "winner": {
      const winner = state.representatives.find((rep) => rep.id === command.playerId);
      if (state.stage !== "live" || !winner) throw new GoldConflict("Wybierz jednego z przedstawicieli tego wyzwania.");
      return settleGoldEscrow(sql, revision, state, winner);
    }
    case "correct-winner": {
      const representative = state.representatives.find((rep) => rep.id === command.playerId);
      if (!state.reward || !state.winner || !representative) throw new GoldConflict("Wybierz przedstawiciela rozliczonego wyzwania.");
      next = { ...state, firstScoreTeam: representative.teamId === state.winner.teamId ? undefined : representative.teamId };
      break;
    }
    case "next-game":
      if (state.stage !== "result") throw new GoldConflict(stale);
      next = { ...state, stage: "six-intro" };
      break;
    case "number-open":
      if (state.stage !== "six-intro") throw new GoldConflict(stale);
      next = { ...state, stage: "six-voting", sixRoundId: randomUUID() };
      break;
    case "number-close":
      if (state.stage !== "six-voting") throw new GoldConflict(stale);
      next = { ...state, stage: "six-closed" };
      break;
    case "number-confirm":
      if (state.stage !== "six-closed") throw new GoldConflict(stale);
      next = { ...state, stage: "six-confirmed", sixPendingNumber: command.number };
      break;
    case "number-settle":
      if (state.stage !== "six-confirmed" || !state.sixPendingNumber) throw new GoldConflict(stale);
      return settleGoldEscrow(sql, revision, state);
    case "correct-number":
      if (!state.sixResult || !state.sixRoundId) throw new GoldConflict("Najpierw rozlicz głosowanie.");
      next = { ...state, sixResult: { ...state.sixResult, scoreNumber: command.number === state.sixResult.number ? undefined : command.number } };
      break;
    case "number-restart":
      if (state.stage !== "six-result" || !state.sixResult?.void) throw new GoldConflict(stale);
      next = { ...state, stage: "six-voting", sixRoundId: randomUUID(), sixResult: undefined };
      break;
    case "complete":
      if (state.stage !== "six-result") throw new GoldConflict(stale);
      next = { ...state, stage: "completed" };
      break;
    case "restart":
      if (state.reward) throw new GoldConflict("Wynik rozliczonej pierwszej gry pozostaje zapisany.");
      next = null;
      break;
    default: throw new GoldConflict(stale);
  }
  if (!(await saveGoldProgress(sql, revision, next, required, next === null ? state.firstEscrowId : undefined)).length) {
    throw new GoldConflict(required.length ? "Sprawdź, czy wybrani przedstawiciele nadal należą do aktywnych składów." : stale);
  }
}

export async function applyFinaleAction({ revision, command }: FinaleAction) {
  await ensureDatabase();
  const sql = database();
  const [current] = await sql`
    SELECT finale_state, finale_revision,
      (SELECT jsonb_object_agg(team_id, points) FROM (${overallTeamScores(sql)}) scores) AS scores
    FROM game_state
    WHERE id = 1 AND status = 'started' AND active_segment = 'finale'
  ` as (FinaleRow & { scores: Record<TeamId, number> })[];
  const stale = "Stan finału lub punktacja się zmieniły. Spróbuj ponownie.";
  if (!current || current.finale_revision !== revision) throw new FinaleConflict(stale);

  const ranking = rankFinaleTeams(Object.entries(current.scores).map(([teamId, points]) => ({ teamId: teamId as TeamId, points })));
  const next = advanceFinale(current.finale_state, command, ranking);
  const expectedScores = ["confirm-finalists", "start", "overall-winner", "complete"].includes(command.action) ? JSON.stringify(current.scores) : null;
  const deltas: Partial<Record<TeamId, number>> = {};
  let audit: Record<string, unknown> = { command: command.action };
  if (command.action === "award") {
    const round = current.finale_state?.rounds[command.round - 1];
    if (!round?.winner) throw new FinaleConflict(stale);
    const previous = round.points ?? null;
    deltas[round.winner] = command.points - (previous ?? 0);
    audit = { ...audit, round: command.round, winner: round.winner, previous, points: command.points, delta: deltas[round.winner] };
  } else if (command.action === "restart") {
    for (const round of current.finale_state?.rounds ?? []) {
      if (round.winner && round.points !== undefined) deltas[round.winner] = (deltas[round.winner] ?? 0) - round.points;
    }
    audit = { ...audit, deltas };
  }
  const rows = await runWithGameLock(sql, sql`
    WITH allocations AS (
      SELECT score.team_id, score.points::BIGINT + delta.value::BIGINT AS new_points
      FROM solenizant_team_scores score JOIN jsonb_each_text(${JSON.stringify(deltas)}::JSONB) delta ON score.team_id = delta.key
      ORDER BY score.team_id FOR UPDATE OF score
    ), changed AS (
      UPDATE game_state
      SET finale_state = ${next === null ? null : JSON.stringify(next)}::JSONB, finale_revision = gen_random_uuid()
      WHERE id = 1 AND status = 'started' AND active_segment = 'finale' AND finale_revision = ${revision}::UUID
        AND NOT EXISTS (SELECT 1 FROM allocations WHERE new_points NOT BETWEEN 0 AND 2147483647)
        AND (${expectedScores}::JSONB IS NULL OR ${expectedScores}::JSONB = (
          SELECT jsonb_object_agg(team_id, points) FROM (${overallTeamScores(sql)}) scores
        ))
      RETURNING id
    ), scored AS (
      UPDATE solenizant_team_scores score SET points = allocations.new_points
      FROM allocations CROSS JOIN changed WHERE score.team_id = allocations.team_id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'finale_action', ${JSON.stringify(audit)}::JSONB FROM changed
    RETURNING id
  `);
  if (!rows.length) throw new FinaleConflict(stale);
}

async function saveFamiliada(
  sql: ReturnType<typeof database>,
  revision: string,
  state: StoredFamiliada,
  requiredPlayerIds: number[],
) {
  return runWithGameLock(sql, sql`
    WITH available AS (
      SELECT id FROM players
      WHERE id = ANY(${requiredPlayerIds}::BIGINT[]) AND active
      ORDER BY id
      FOR UPDATE
    )
    UPDATE game_state SET familiada_state = ${JSON.stringify(state)}::JSONB, familiada_revision = gen_random_uuid()
    WHERE id = 1 AND status = 'started' AND active_segment = 'familiada' AND familiada_revision = ${revision}::UUID
      AND (SELECT COUNT(*) FROM available) = ${requiredPlayerIds.length}::INTEGER
    RETURNING id
  `);
}

async function placeFamiliadaBet(sql: ReturnType<typeof database>, revision: string, state: StoredFamiliada, bettorId: number, target: TeamId) {
  const match = state.matches[state.matchIndex];
  const stake = match.betStake ?? LEGACY_DUEL_BET_STAKE;
  if (state.stage !== "betting" || !match.teams.includes(target)) return [];
  return runWithGameLock(sql, sql`
    WITH debited AS (
      UPDATE players player
      SET tokens = player.tokens - ${stake}::NUMERIC
      FROM game_state game
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'familiada'
        AND game.familiada_revision = ${revision}::UUID
        AND player.id = ${bettorId} AND player.active
        AND player.team_id NOT IN (${match.teams[0]}, ${match.teams[1]})
        AND player.tokens >= ${stake}::NUMERIC
        AND NOT EXISTS (
          SELECT 1 FROM familiada_bets WHERE match_index = ${state.matchIndex} AND bettor_id = player.id
        )
      RETURNING player.id
    )
    INSERT INTO familiada_bets (match_index, bettor_id, target_team_id, stake)
    SELECT ${state.matchIndex}::SMALLINT, id, ${target}, ${stake}::NUMERIC FROM debited
    RETURNING bettor_id
  `);
}

/** One transaction confirms the scoreboard and applies the SPORT-style chip settlement. */
async function settleFamiliadaMatch(sql: ReturnType<typeof database>, revision: string, state: StoredFamiliada, winner: TeamId) {
  const match = state.matches[state.matchIndex];
  const loser = match.teams[0] === winner ? match.teams[1] : match.teams[0];
  const rows = await runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT id, ${winner}::TEXT AS winner, ${loser}::TEXT AS loser FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'familiada'
        AND familiada_revision = ${revision}::UUID
        AND familiada_state ->> 'stage' = 'match-confirmation'
    ),
    bets AS (
      SELECT bet.* FROM familiada_bets bet CROSS JOIN candidate
      WHERE bet.match_index = ${state.matchIndex} AND bet.result = 'pending'
    ),
    ${teamBetAllocations(sql)},
    approved AS (
      SELECT candidate.id FROM candidate CROSS JOIN outcome WHERE outcome.status = 'settled'
    ),
    settled_bets AS (
      UPDATE familiada_bets bet
      SET result = CASE WHEN bet.target_team_id = ${winner} THEN 'won' ELSE 'lost' END,
        payout = CASE WHEN bet.target_team_id = ${winner} THEN bet.stake + ${SPORT_CORRECT_BET_PROFIT}::NUMERIC ELSE 0 END,
        settled_at = NOW()
      FROM bets CROSS JOIN approved
      WHERE bet.match_index = bets.match_index AND bet.bettor_id = bets.bettor_id
      RETURNING bet.bettor_id, bet.payout
    ),
    updated_players AS (
      UPDATE players player SET tokens = player.tokens + allocations.delta
      FROM allocations CROSS JOIN approved
      WHERE player.id = allocations.player_id AND allocations.delta <> 0
      RETURNING player.id, allocations.delta
    ),
    saved AS (
      UPDATE game_state game SET familiada_state = ${JSON.stringify(state)}::JSONB, familiada_revision = gen_random_uuid()
      FROM approved WHERE game.id = approved.id
      RETURNING game.id
    ), audited AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'familiada_match_settled', jsonb_build_object(
        'matchIndex', ${state.matchIndex}::INTEGER, 'winnerTeamId', ${winner}::TEXT,
        'transfers', COALESCE((SELECT jsonb_object_agg(id, delta) FROM updated_players), '{}'::JSONB)
      ) FROM saved
    )
    SELECT status FROM outcome
  `) as { status: TeamBetSettlement }[];
  return rows[0].status;
}

async function restartFamiliada(sql: ReturnType<typeof database>, revision: string) {
  return runWithGameLock(sql, sql`
    WITH reset AS (
      UPDATE game_state SET familiada_state = NULL, familiada_revision = gen_random_uuid()
      WHERE id = 1 AND status = 'started' AND active_segment = 'familiada' AND familiada_revision = ${revision}::UUID
      RETURNING id
    ),
    cleared AS (
      DELETE FROM familiada_bets WHERE EXISTS (SELECT 1 FROM reset)
      RETURNING bettor_id, stake, result
    ),
    refunds AS (
      SELECT bettor_id, SUM(stake) AS amount FROM cleared WHERE result = 'pending' GROUP BY bettor_id
    ),
    refunded AS (
      UPDATE players player SET tokens = player.tokens + refunds.amount FROM refunds
      WHERE player.id = refunds.bettor_id
      RETURNING player.id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'familiada_restart', jsonb_build_object('refundedPlayers', (SELECT COUNT(*) FROM refunded)) FROM reset
    RETURNING id
  `);
}

export async function applyFamiliadaAction({ revision, command }: FamiliadaAction, voterId?: number) {
  await ensureDatabase();
  const sql = database();
  const stale = "Stan Familiady się zmienił. Sprawdź obecny etap i ponów akcję.";
  const [current] = await sql`
    SELECT familiada_state, familiada_revision FROM game_state
    WHERE id = 1 AND status = 'started' AND active_segment = 'familiada'
  ` as FamiliadaRow[];
  if (!current || current.familiada_revision !== revision) throw new FamiliadaConflict(stale);

  const state = current.familiada_state;
  if (command.action === "restart") {
    if (!(await restartFamiliada(sql, revision)).length) throw new FamiliadaConflict(stale);
    return;
  }
  if (command.action === "bet") {
    if (!state || voterId === undefined || !(await placeFamiliadaBet(sql, revision, state, voterId, command.teamId)).length) {
      throw new FamiliadaConflict("Nie możesz postawić zakładu. Sprawdź etap meczu, swoją drużynę i saldo.");
    }
    return;
  }

  const round = state?.matches[state.matchIndex].rounds[state.questionIndex];
  let ids: number[] = [];
  switch (command.action) {
    case "start-question":
    case "replace-representatives": ids = command.players; break;
    case "activate": ids = round?.representatives.map((player) => player.id) ?? []; break;
    case "respondent": ids = [command.playerId]; break;
    case "buzz": if (voterId !== undefined) ids = [voterId]; break;
  }
  const activePlayers = ids.length ? await sql`
    SELECT id, nickname, team_id AS "teamId" FROM players WHERE active AND id = ANY(${ids}::BIGINT[])
  ` as { id: number; nickname: string; teamId: TeamId }[] : [];
  const representatives = ids.flatMap((id) => activePlayers.filter((player) => player.id === id));
  const next = advanceFamiliada(state, command, representatives, voterId);

  if (command.action === "confirm-match") {
    const status = await settleFamiliadaMatch(sql, revision, next, command.teamId);
    if (status !== "settled") throw new FamiliadaConflict(getTeamBetSettlementError(status));
  } else if (!(await saveFamiliada(sql, revision, next, ids)).length) {
    throw new FamiliadaConflict(stale);
  }
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    teamId: row.team_id,
    tokens: normalizeChipAmount(row.tokens),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

function normalizeChipAmount(value: string | number) {
  return typeof value === "number" ? value.toFixed(4) : value;
}

function alkoholicyMarket(betStake: string, row?: AlkoholicyBetSummary): AlkoholicyMarket {
  return {
    betStake,
    counts: { pending: row?.pending ?? 0, won: row?.won ?? 0, lost: row?.lost ?? 0, refunded: row?.refunded ?? 0 },
    viewerBet: row?.target && row.result && row.payout !== null
      ? { target: row.target, result: row.result, payout: normalizeChipAmount(row.payout) }
      : null,
  };
}

function toGameState(row: GameRow): GameState {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.started_at ? toIsoTimestamp(row.started_at) : null,
    activeSegment: row.active_segment,
    solenizantStage: row.solenizant_stage,
    currentQuestionIndex: row.current_question_index,
    theFloorStage: row.the_floor_stage,
    currentTheFloorDuelSequence: row.current_the_floor_duel_sequence,
    sportStage: row.sport_stage,
    currentSportChallengeSequence: row.current_sport_challenge_sequence,
    currentSportBonusSequence: row.current_sport_bonus_sequence,
    melodiaStage: row.melodia_stage,
    currentMelodiaSongSequence: row.current_melodia_song_sequence,
    melodiaWinningTeamId: row.melodia_winning_team_id,
    melodiaSettledAt: row.melodia_settled_at ? toIsoTimestamp(row.melodia_settled_at) : null,
    pojedynkiStage: row.pojedynki_stage,
    currentPojedynkiDuelSequence: row.current_pojedynki_duel_sequence,
  };
}

function toSportPairing(row: SportPairingRow): SportPairing {
  return { slot: row.slot, teamAId: row.team_a_id, teamBId: row.team_b_id };
}

function toSportPlayerNumber(row: SportPlayerNumberRow): SportPlayerNumber {
  return { teamId: row.team_id, playerId: row.player_id, number: row.player_number };
}

function toSportChallenge(row: SportChallengeRow, betCount: number, viewerBet: SportViewerBetRow | undefined): SportChallenge {
  return {
    id: row.id,
    scoreRevision: row.settled_at ? row.score_revision : null,
    sequence: row.sequence,
    pairSlot: row.pair_slot,
    stage: row.stage,
    winnerTeamId: row.winner_team_id,
    betCount,
    betStake: normalizeChipAmount(row.bet_stake),
    viewerBetTargetTeamId: viewerBet?.target_team_id ?? null,
    viewerBetResult: viewerBet?.result ?? null,
    viewerBetPayout: viewerBet ? normalizeChipAmount(viewerBet.payout) : null,
  };
}

function toSportBonusRound(row: SportBonusRow, requirements: SportBonusRequirementRow[]): SportBonusRound {
  return {
    id: row.id,
    sequence: row.sequence,
    stage: row.stage,
    requirements: requirements.filter((requirement) => requirement.bonus_round_id === row.id).map((requirement) => ({ teamId: requirement.team_id, limbs: requirement.limbs })),
    winnerTeamId: row.winner_team_id,
    points: row.points,
  };
}

function toMelodiaSong(row: MelodiaSongRow): MelodiaSong {
  return {
    id: row.id,
    sequence: row.sequence,
    stage: row.stage,
    winningTeamId: row.winning_team_id,
    artistPoints: row.artist_points,
    titlePoints: row.title_points,

  };
}

function toPojedynkiDuel(row: PojedynkiDuelRow, betCount: number, viewerBet: PojedynkiViewerBetRow | undefined): PojedynkiDuel {
  return {
    id: row.id,
    scoreRevision: row.settled_at ? row.score_revision : null,
    sequence: row.sequence,
    stage: row.stage,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    winnerTeamId: row.winner_team_id,
    betCount,
    betStake: normalizeChipAmount(row.bet_stake),
    viewerBetTargetTeamId: viewerBet?.target_team_id ?? null,
    viewerBetResult: viewerBet?.result ?? null,
    viewerBetPayout: viewerBet ? normalizeChipAmount(viewerBet.payout) : null,
  };
}

function toTeamScore(row: TeamScoreRow): TeamScore {
  return { teamId: row.team_id, points: row.points };
}

function toTheFloorDuel(row: TheFloorDuelRow, betCount: number, viewerBet: TheFloorViewerBetRow | undefined): TheFloorDuel {
  return {
    id: row.id,
    sequence: row.sequence,
    categoryId: row.category_id,
    settledAt: row.settled_at ? toIsoTimestamp(row.settled_at) : null,
    stage: row.stage,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    activeTeamId: row.active_team_id,
    itemIndex: row.item_index,
    teamATimeSeconds: row.team_a_time_seconds,
    teamBTimeSeconds: row.team_b_time_seconds,
    turnStartedAt: row.turn_started_at ? toIsoTimestamp(row.turn_started_at) : null,
    startedAt: row.started_at ? toIsoTimestamp(row.started_at) : null,
    endedAt: row.ended_at ? toIsoTimestamp(row.ended_at) : null,
    winnerTeamId: row.winner_team_id,
    betCount,
    betStake: normalizeChipAmount(row.bet_stake),
    viewerBetTargetTeamId: viewerBet?.target_team_id ?? null,
    viewerBetResult: viewerBet?.result ?? null,
    viewerBetPayout: viewerBet ? normalizeChipAmount(viewerBet.payout) : null,
  };
}

function toSession(row: SessionRow): Session | null {
  const expiresAt = Math.floor(new Date(row.expires_at).getTime() / 1000);
  if (!Number.isFinite(expiresAt)) return null;
  if ((row.role === "admin" || row.role === "observer") && row.player_id === null) return { role: row.role, expiresAt };
  if (row.role === "player" && typeof row.player_id === "number") return { role: "player", playerId: row.player_id, expiresAt };
  return null;
}

function toIsoTimestamp(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

/** Creates the tiny schema on first use, so a new Neon database needs no migration command. */
export async function ensureDatabase() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = database();
      await sql`
        CREATE TABLE IF NOT EXISTS players (
          id BIGSERIAL PRIMARY KEY,
          nickname VARCHAR(24) NOT NULL,
          team_id VARCHAR(16) NOT NULL CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          tokens NUMERIC(20,4) NOT NULL DEFAULT 100 CHECK (tokens >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          active BOOLEAN NOT NULL DEFAULT TRUE,
          removed_at TIMESTAMPTZ
        )
      `;
      await sql`ALTER TABLE players ALTER COLUMN tokens TYPE NUMERIC(20,4) USING tokens::NUMERIC(20,4)`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`;
      await sql`ALTER TABLE players ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS players_nickname_lower_unique ON players (LOWER(nickname))`;
      await sql`
        CREATE TABLE IF NOT EXISTS chip_adjustments (
          id BIGSERIAL PRIMARY KEY,
          player_id BIGINT NOT NULL REFERENCES players(id),
          previous_tokens NUMERIC(20,4) NOT NULL,
          new_tokens NUMERIC(20,4) NOT NULL CHECK (new_tokens >= 0),
          adjustment NUMERIC(20,4) NOT NULL,
          kind VARCHAR(32) NOT NULL DEFAULT 'admin_adjustment',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS admin_actions (
          id BIGSERIAL PRIMARY KEY,
          action VARCHAR(48) NOT NULL,
          details JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS game_state (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          status VARCHAR(16) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'started')),
          started_at TIMESTAMPTZ,
          active_segment VARCHAR(16) NOT NULL DEFAULT 'solenizant' CONSTRAINT game_state_active_segment_check CHECK (active_segment IN ('solenizant', 'the-floor', 'sport', 'melodia', 'pojedynki', 'familiada', 'gold-challenge', 'alkoholicy', 'finale')),
          solenizant_stage VARCHAR(16) NOT NULL DEFAULT 'intro' CONSTRAINT game_state_solenizant_stage_check CHECK (solenizant_stage IN ('intro', 'question', 'scoring', 'results')),
          current_question_index SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_solenizant_question_index_check CHECK (current_question_index BETWEEN 0 AND 5),
          the_floor_stage VARCHAR(16) NOT NULL DEFAULT 'intro' CONSTRAINT game_state_the_floor_stage_check CHECK (the_floor_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'results')),
          current_the_floor_duel_sequence SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_the_floor_sequence_check CHECK (current_the_floor_duel_sequence BETWEEN 0 AND 5),
          sport_stage VARCHAR(16) NOT NULL DEFAULT 'intro' CONSTRAINT game_state_sport_stage_check CHECK (sport_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'bonus-setup', 'bonus-live', 'bonus-result', 'results')),
          current_sport_challenge_sequence SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_sport_challenge_sequence_check CHECK (current_sport_challenge_sequence BETWEEN 0 AND 7),
          current_sport_bonus_sequence SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_sport_bonus_sequence_check CHECK (current_sport_bonus_sequence BETWEEN 0 AND 1),
          melodia_stage VARCHAR(16) NOT NULL DEFAULT 'intro' CONSTRAINT game_state_melodia_flow_check CHECK (melodia_stage IN ('intro', 'ready', 'song', 'scoring', 'result', 'results', 'completed')),
          current_melodia_song_sequence SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_melodia_song_sequence_check CHECK (current_melodia_song_sequence BETWEEN 0 AND 4),
          melodia_winning_team_id VARCHAR(16) CONSTRAINT game_state_melodia_winning_team_check CHECK (melodia_winning_team_id IS NULL OR melodia_winning_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          melodia_settled_at TIMESTAMPTZ,
          pojedynki_stage VARCHAR(16) NOT NULL DEFAULT 'intro' CONSTRAINT game_state_pojedynki_stage_check CHECK (pojedynki_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'results')),
          current_pojedynki_duel_sequence SMALLINT NOT NULL DEFAULT 0 CONSTRAINT game_state_pojedynki_duel_sequence_check CHECK (current_pojedynki_duel_sequence BETWEEN 0 AND 3)
        )
      `;
      await sql`INSERT INTO game_state (id, status) VALUES (1, 'waiting') ON CONFLICT (id) DO NOTHING`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS active_segment VARCHAR(16) NOT NULL DEFAULT 'solenizant'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS solenizant_stage VARCHAR(16) NOT NULL DEFAULT 'intro'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_question_index SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS the_floor_stage VARCHAR(16) NOT NULL DEFAULT 'intro'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_the_floor_duel_sequence SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS sport_stage VARCHAR(16) NOT NULL DEFAULT 'intro'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_sport_challenge_sequence SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_sport_bonus_sequence SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS melodia_stage VARCHAR(16) NOT NULL DEFAULT 'intro'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_melodia_song_sequence SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS melodia_winning_team_id VARCHAR(16)`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS melodia_settled_at TIMESTAMPTZ`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pojedynki_stage VARCHAR(16) NOT NULL DEFAULT 'intro'`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS current_pojedynki_duel_sequence SMALLINT NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS familiada_state JSONB, ADD COLUMN IF NOT EXISTS familiada_revision UUID NOT NULL DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS finale_state JSONB, ADD COLUMN IF NOT EXISTS finale_revision UUID NOT NULL DEFAULT gen_random_uuid()`;
      await sql`
        ALTER TABLE game_state ADD COLUMN IF NOT EXISTS alkoholicy_state JSONB,
          ADD COLUMN IF NOT EXISTS alkoholicy_revision UUID NOT NULL DEFAULT gen_random_uuid(),
          ADD COLUMN IF NOT EXISTS gold_state JSONB,
          ADD COLUMN IF NOT EXISTS gold_revision UUID NOT NULL DEFAULT gen_random_uuid()
      `;
      await sql`
        DO $$
        BEGIN
          ALTER TABLE game_state DROP CONSTRAINT IF EXISTS game_state_active_segment_check;
          ALTER TABLE game_state ADD CONSTRAINT game_state_active_segment_check CHECK (active_segment IN ('solenizant', 'the-floor', 'sport', 'melodia', 'pojedynki', 'familiada', 'gold-challenge', 'alkoholicy', 'finale'));
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_solenizant_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_solenizant_stage_check CHECK (solenizant_stage IN ('intro', 'question', 'scoring', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_solenizant_question_index_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_solenizant_question_index_check CHECK (current_question_index BETWEEN 0 AND 5);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_the_floor_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_the_floor_stage_check CHECK (the_floor_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('game_state_the_floor_sequence_check', 'game_state_the_floor_seven_slots')) THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_the_floor_sequence_check CHECK (current_the_floor_duel_sequence BETWEEN 0 AND 5);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_sport_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_sport_stage_check CHECK (sport_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'bonus-setup', 'bonus-live', 'bonus-result', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_sport_challenge_sequence_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_sport_challenge_sequence_check CHECK (current_sport_challenge_sequence BETWEEN 0 AND 7);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_sport_bonus_sequence_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_sport_bonus_sequence_check CHECK (current_sport_bonus_sequence BETWEEN 0 AND 1);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_melodia_song_sequence_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_melodia_song_sequence_check CHECK (current_melodia_song_sequence BETWEEN 0 AND 4);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_melodia_winning_team_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_melodia_winning_team_check CHECK (melodia_winning_team_id IS NULL OR melodia_winning_team_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_pojedynki_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_pojedynki_stage_check CHECK (pojedynki_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_pojedynki_duel_sequence_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_pojedynki_duel_sequence_check CHECK (current_pojedynki_duel_sequence BETWEEN 0 AND 3);
          END IF;
        END $$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS solenizant_team_scores (
          team_id VARCHAR(16) PRIMARY KEY CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
        )
      `;
      await sql`
        INSERT INTO solenizant_team_scores (team_id, points)
        VALUES ('royal', 0), ('ruby', 0), ('emerald', 0), ('onyx', 0)
        ON CONFLICT (team_id) DO NOTHING
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS solenizant_question_awards (
          question_index SMALLINT PRIMARY KEY CHECK (question_index BETWEEN 0 AND 5),
          awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sessions (
          token VARCHAR(64) PRIMARY KEY,
          role VARCHAR(16) NOT NULL,
          player_id BIGINT REFERENCES players(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT sessions_role_and_player_check CHECK (
            (role = 'player' AND player_id IS NOT NULL)
            OR (role IN ('admin', 'observer') AND player_id IS NULL)
          )
        )
      `;
      await sql`
        DO $migration$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND conname = 'sessions_role_and_player_check') THEN
            LOCK TABLE sessions IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND conname = 'sessions_role_and_player_check') THEN
              ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_role_check,
                DROP CONSTRAINT IF EXISTS sessions_check,
                ADD CONSTRAINT sessions_role_and_player_check CHECK (
                  (role = 'player' AND player_id IS NOT NULL)
                  OR (role IN ('admin', 'observer') AND player_id IS NULL)
                );
            END IF;
          END IF;
        END $migration$
      `;
      await sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_index ON sessions (expires_at)`;
      await sql`
        CREATE TABLE IF NOT EXISTS the_floor_duels (
          id BIGSERIAL PRIMARY KEY,
          sequence SMALLINT NOT NULL UNIQUE CHECK (sequence BETWEEN 0 AND 5),
          category_id VARCHAR(32) NOT NULL,
          stage VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'betting', 'live', 'result')),
          player_a_id BIGINT REFERENCES players(id),
          player_b_id BIGINT REFERENCES players(id),
          active_player_id BIGINT REFERENCES players(id),
          team_a_id VARCHAR(16) CONSTRAINT the_floor_duels_team_a_check CHECK (team_a_id IS NULL OR team_a_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          team_b_id VARCHAR(16) CONSTRAINT the_floor_duels_team_b_check CHECK (team_b_id IS NULL OR team_b_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          active_team_id VARCHAR(16) CONSTRAINT the_floor_duels_active_team_check CHECK (active_team_id IS NULL OR active_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          item_index SMALLINT NOT NULL DEFAULT 0 CONSTRAINT the_floor_duels_item_index_nonnegative CHECK (item_index >= 0),
          player_a_time_seconds SMALLINT NOT NULL DEFAULT 45 CHECK (player_a_time_seconds BETWEEN 0 AND 45),
          player_b_time_seconds SMALLINT NOT NULL DEFAULT 45 CHECK (player_b_time_seconds BETWEEN 0 AND 45),
          team_a_time_seconds SMALLINT NOT NULL DEFAULT 45 CONSTRAINT the_floor_duels_team_a_time_check CHECK (team_a_time_seconds BETWEEN 0 AND 45),
          team_b_time_seconds SMALLINT NOT NULL DEFAULT 45 CONSTRAINT the_floor_duels_team_b_time_check CHECK (team_b_time_seconds BETWEEN 0 AND 45),
          turn_started_at TIMESTAMPTZ,
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          winner_id BIGINT REFERENCES players(id),
          winner_team_id VARCHAR(16) CONSTRAINT the_floor_duels_winner_team_check CHECK (winner_team_id IS NULL OR winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          settled_at TIMESTAMPTZ,
          CHECK (player_a_id IS NULL OR player_b_id IS NULL OR player_a_id <> player_b_id),
          CONSTRAINT the_floor_duels_team_pair_check CHECK (player_a_id IS NOT NULL OR player_b_id IS NOT NULL OR team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id),
          CONSTRAINT the_floor_duels_active_team_member_check CHECK (active_team_id IS NULL OR active_team_id IN (team_a_id, team_b_id))
        )
      `;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS
        bet_stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (bet_stake IN (2, 4))`;
      await sql`
        CREATE TABLE IF NOT EXISTS the_floor_bets (
          id BIGSERIAL PRIMARY KEY,
          duel_id BIGINT NOT NULL REFERENCES the_floor_duels(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_player_id BIGINT REFERENCES players(id),
          target_team_id VARCHAR(16) CONSTRAINT the_floor_bets_target_team_check CHECK (target_team_id IS NULL OR target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'refunded')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (duel_id, bettor_id)
        )
      `;
      await sql`ALTER TABLE the_floor_bets ALTER COLUMN stake DROP DEFAULT`;
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'the_floor_duels'::regclass AND conname = 'the_floor_duels_item_index_nonnegative'
          ) THEN
            LOCK TABLE the_floor_duels IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint
              WHERE conrelid = 'the_floor_duels'::regclass AND conname = 'the_floor_duels_item_index_nonnegative'
            ) THEN
              ALTER TABLE the_floor_duels DROP CONSTRAINT IF EXISTS the_floor_duels_item_index_check,
                ADD CONSTRAINT the_floor_duels_item_index_nonnegative CHECK (item_index >= 0);
            END IF;
          END IF;
        END $$
      `;

      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS item_order JSONB`;
      // Keep the saved order of surviving cards, including duels from before shuffling.
      await runWithGameLock(sql, sql`
        WITH removed(category_id, keys) AS (
          VALUES
            ('lokalne-miejsca', ARRAY['45']),
            ('loga', ARRAY['5', '16', '17', '19', '21', '22', '23', '24', '27', '31', '45', '48'])
        ), remaining AS (
          SELECT duel.id, jsonb_agg(card.key ORDER BY card.position) AS item_order,
            COUNT(*) FILTER (WHERE card.position <= duel.item_index) % COUNT(*) AS item_index
          FROM the_floor_duels duel JOIN removed USING (category_id)
          CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(duel.item_order, (
            SELECT jsonb_agg(old_key::TEXT ORDER BY old_key) FROM generate_series(1, 50) AS old_keys(old_key)
          ))) WITH ORDINALITY AS card(key, position)
          WHERE duel.stage IN ('betting', 'live')
            AND (duel.item_order IS NULL OR duel.item_order ?| removed.keys)
            AND card.key <> ALL(removed.keys)
          GROUP BY duel.id
        )
        UPDATE the_floor_duels duel SET item_order = remaining.item_order, item_index = remaining.item_index
        FROM remaining WHERE duel.id = remaining.id
      `);
      await sql`
        DO $migration$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_state'::regclass AND conname = 'game_state_the_floor_seven_slots') THEN
            LOCK TABLE game_state, the_floor_duels IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_state'::regclass AND conname = 'game_state_the_floor_seven_slots') THEN
              ALTER TABLE game_state DROP CONSTRAINT IF EXISTS game_state_the_floor_sequence_check,
                ADD CONSTRAINT game_state_the_floor_seven_slots CHECK (current_the_floor_duel_sequence BETWEEN 0 AND 6);
              ALTER TABLE the_floor_duels DROP CONSTRAINT IF EXISTS the_floor_duels_sequence_check,
                ADD CONSTRAINT the_floor_duels_seven_slots CHECK (sequence BETWEEN 0 AND 6);
            END IF;
          END IF;
        END $migration$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS floor_device_presence (
          session_token TEXT NOT NULL REFERENCES sessions(token) ON DELETE CASCADE,
          device_id UUID NOT NULL,
          catalog_version TEXT,
          decoded INTEGER NOT NULL CHECK (decoded >= 0),
          failed_assets JSONB NOT NULL DEFAULT '[]'::JSONB,
          seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (session_token, device_id)
        )
      `;
      await sql`ALTER TABLE floor_device_presence ADD COLUMN IF NOT EXISTS failed_assets JSONB NOT NULL DEFAULT '[]'::JSONB`;
      await sql`
        INSERT INTO the_floor_duels (sequence, category_id)
        SELECT (MAX(duel.sequence) + 1)::SMALLINT, 'politycy'
        FROM the_floor_duels duel CROSS JOIN game_state game
        WHERE game.id = 1 AND game.the_floor_stage IN ('setup', 'betting', 'live', 'result')
        HAVING COUNT(*) BETWEEN 1 AND 6 AND COUNT(*) FILTER (WHERE duel.category_id = 'politycy') = 0
        ON CONFLICT (sequence) DO NOTHING
      `;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS team_a_id VARCHAR(16)`;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS team_b_id VARCHAR(16)`;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS active_team_id VARCHAR(16)`;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS team_a_time_seconds SMALLINT`;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS team_b_time_seconds SMALLINT`;
      await sql`ALTER TABLE the_floor_duels ADD COLUMN IF NOT EXISTS winner_team_id VARCHAR(16)`;
      await sql`ALTER TABLE the_floor_bets ADD COLUMN IF NOT EXISTS target_team_id VARCHAR(16)`;
      await sql`ALTER TABLE the_floor_bets ALTER COLUMN target_player_id DROP NOT NULL`;
      await sql`
        UPDATE the_floor_duels duel
        SET
          team_a_id = COALESCE(duel.team_a_id, (SELECT team_id FROM players WHERE id = duel.player_a_id)),
          team_b_id = COALESCE(duel.team_b_id, (SELECT team_id FROM players WHERE id = duel.player_b_id)),
          active_team_id = COALESCE(duel.active_team_id, (SELECT team_id FROM players WHERE id = duel.active_player_id)),
          team_a_time_seconds = COALESCE(duel.team_a_time_seconds, duel.player_a_time_seconds),
          team_b_time_seconds = COALESCE(duel.team_b_time_seconds, duel.player_b_time_seconds),
          winner_team_id = COALESCE(duel.winner_team_id, (SELECT team_id FROM players WHERE id = duel.winner_id))
      `;
      await sql`UPDATE the_floor_duels SET team_a_time_seconds = ${THE_FLOOR_DUEL_SECONDS} WHERE team_a_time_seconds IS NULL`;
      // The retired deck occupied the slot now used by Rebusy. Preserve duel identity and wagers.
      await sql`
        UPDATE the_floor_duels SET category_id = 'rebusy', item_index = 0
        WHERE category_id = 'znane-kobiety' AND stage <> 'result'
      `;
      await sql`UPDATE the_floor_duels SET team_b_time_seconds = ${THE_FLOOR_DUEL_SECONDS} WHERE team_b_time_seconds IS NULL`;
      await sql`ALTER TABLE the_floor_duels ALTER COLUMN team_a_time_seconds SET DEFAULT 45`;
      await sql`ALTER TABLE the_floor_duels ALTER COLUMN team_b_time_seconds SET DEFAULT 45`;
      await sql`ALTER TABLE the_floor_duels ALTER COLUMN team_a_time_seconds SET NOT NULL`;
      await sql`ALTER TABLE the_floor_duels ALTER COLUMN team_b_time_seconds SET NOT NULL`;
      await sql`
        UPDATE the_floor_bets bet
        SET target_team_id = COALESCE(bet.target_team_id, (SELECT team_id FROM players WHERE id = bet.target_player_id))
      `;
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_team_a_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_team_a_check CHECK (team_a_id IS NULL OR team_a_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_team_b_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_team_b_check CHECK (team_b_id IS NULL OR team_b_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_active_team_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_active_team_check CHECK (active_team_id IS NULL OR active_team_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_team_a_time_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_team_a_time_check CHECK (team_a_time_seconds BETWEEN 0 AND 45);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_team_b_time_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_team_b_time_check CHECK (team_b_time_seconds BETWEEN 0 AND 45);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_winner_team_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_winner_team_check CHECK (winner_team_id IS NULL OR winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_team_pair_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_team_pair_check CHECK (player_a_id IS NOT NULL OR player_b_id IS NOT NULL OR team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_duels_active_team_member_check') THEN
            ALTER TABLE the_floor_duels ADD CONSTRAINT the_floor_duels_active_team_member_check CHECK (active_team_id IS NULL OR active_team_id IN (team_a_id, team_b_id));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'the_floor_bets_target_team_check') THEN
            ALTER TABLE the_floor_bets ADD CONSTRAINT the_floor_bets_target_team_check CHECK (target_team_id IS NULL OR target_team_id IN ('royal', 'ruby', 'emerald', 'onyx'));
          END IF;
        END $$
      `;
      await sql`CREATE INDEX IF NOT EXISTS the_floor_bets_duel_index ON the_floor_bets (duel_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_pairings (
          slot VARCHAR(1) PRIMARY KEY CHECK (slot IN ('a', 'b')),
          team_a_id VARCHAR(16) NOT NULL CHECK (team_a_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          team_b_id VARCHAR(16) NOT NULL CHECK (team_b_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          CHECK (team_a_id <> team_b_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_player_numbers (
          team_id VARCHAR(16) NOT NULL CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          player_id BIGINT NOT NULL REFERENCES players(id),
          player_number SMALLINT NOT NULL CONSTRAINT sport_player_numbers_rank_check CHECK (player_number >= 1),
          PRIMARY KEY (team_id, player_number),
          UNIQUE (team_id, player_id)
        )
      `;
      await sql`
        DO $$
        DECLARE old_constraint TEXT;
        BEGIN
          FOR old_constraint IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'sport_player_numbers'::regclass
              AND contype = 'c'
              AND (
                conname = 'sport_player_numbers_player_number_check'
                OR (pg_get_constraintdef(oid) LIKE '%player_number%' AND pg_get_constraintdef(oid) LIKE '%5%')
              )
          LOOP
            EXECUTE format('ALTER TABLE sport_player_numbers DROP CONSTRAINT %I', old_constraint);
          END LOOP;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sport_player_numbers_rank_check') THEN
            ALTER TABLE sport_player_numbers ADD CONSTRAINT sport_player_numbers_rank_check CHECK (player_number >= 1);
          END IF;
        END $$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_challenges (
          id BIGSERIAL PRIMARY KEY,
          sequence SMALLINT NOT NULL UNIQUE CHECK (sequence BETWEEN 0 AND 7),
          pair_slot VARCHAR(1) NOT NULL CHECK (pair_slot IN ('a', 'b')),
          stage VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'betting', 'live', 'result')),
          winner_team_id VARCHAR(16) CHECK (winner_team_id IS NULL OR winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          settled_at TIMESTAMPTZ
        )
      `;
      await sql`ALTER TABLE sport_challenges ADD COLUMN IF NOT EXISTS
        bet_stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (bet_stake IN (2, 4))`;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_bets (
          id BIGSERIAL PRIMARY KEY,
          challenge_id BIGINT NOT NULL REFERENCES sport_challenges(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (challenge_id, bettor_id)
        )
      `;
      await sql`ALTER TABLE sport_bets ALTER COLUMN stake DROP DEFAULT`;
      await sql`CREATE INDEX IF NOT EXISTS sport_bets_challenge_index ON sport_bets (challenge_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_bonus_rounds (
          id BIGSERIAL PRIMARY KEY,
          sequence SMALLINT NOT NULL UNIQUE CHECK (sequence BETWEEN 0 AND 1),
          stage VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'setup', 'live', 'result')),
          winner_team_id VARCHAR(16) CHECK (winner_team_id IS NULL OR winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          points INTEGER CHECK (points IS NULL OR points >= 0),
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_bonus_requirements (
          bonus_round_id BIGINT NOT NULL REFERENCES sport_bonus_rounds(id) ON DELETE CASCADE,
          team_id VARCHAR(16) NOT NULL CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          limbs SMALLINT NOT NULL CHECK (limbs BETWEEN 0 AND 100),
          PRIMARY KEY (bonus_round_id, team_id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS sport_chip_transfers (
          id BIGSERIAL PRIMARY KEY,
          challenge_id BIGINT NOT NULL REFERENCES sport_challenges(id) ON DELETE CASCADE,
          player_id BIGINT NOT NULL REFERENCES players(id),
          direction VARCHAR(8) NOT NULL CHECK (direction IN ('credit', 'debit')),
          amount NUMERIC(20,4) NOT NULL CHECK (amount > 0),
          kind VARCHAR(40) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS melodia_songs (
          id BIGSERIAL PRIMARY KEY,
          sequence SMALLINT NOT NULL UNIQUE CHECK (sequence BETWEEN 0 AND 4),
          stage VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'live', 'scoring', 'result')),
          winning_team_id VARCHAR(16) CHECK (winning_team_id IS NULL OR winning_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          artist_points SMALLINT CHECK (artist_points IS NULL OR artist_points IN (0, 1)),
          title_points SMALLINT CHECK (title_points IS NULL OR title_points IN (0, 1)),
          started_at TIMESTAMPTZ,
          scored_at TIMESTAMPTZ
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS melodia_team_scores (
          team_id VARCHAR(16) PRIMARY KEY CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)
        )
      `;
      await sql`
        INSERT INTO melodia_team_scores (team_id, points)
        VALUES ('royal', 0), ('ruby', 0), ('emerald', 0), ('onyx', 0)
        ON CONFLICT (team_id) DO NOTHING
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS melodia_chip_transfers (
          final_song_id BIGINT NOT NULL,
          player_id BIGINT NOT NULL REFERENCES players(id),
          previous_tokens NUMERIC(20,4) NOT NULL CHECK (previous_tokens >= 0),
          new_tokens NUMERIC(20,4) NOT NULL CHECK (new_tokens >= 0),
          delta NUMERIC(20,4) NOT NULL CHECK (new_tokens = previous_tokens + delta),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (final_song_id, player_id)
        )
      `;
      await sql`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_state'::regclass AND conname = 'game_state_melodia_flow_check') THEN
            RETURN;
          END IF;
          LOCK TABLE game_state IN ACCESS EXCLUSIVE MODE;
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'game_state'::regclass AND conname = 'game_state_melodia_flow_check') THEN
            RETURN;
          END IF;

          IF to_regclass('melodia_bets') IS NOT NULL THEN
            WITH refunds AS (
              UPDATE melodia_bets SET result = 'refunded', payout = stake, settled_at = NOW()
              WHERE result = 'pending'
              RETURNING bettor_id, stake
            )
            UPDATE players SET tokens = players.tokens + refunds.stake
            FROM refunds WHERE players.id = refunds.bettor_id;
          END IF;

          ALTER TABLE game_state DROP CONSTRAINT IF EXISTS game_state_melodia_stage_check;
          UPDATE game_state
          SET melodia_stage = CASE
            WHEN melodia_stage = 'betting' THEN 'ready'
            WHEN melodia_stage = 'results' AND melodia_settled_at IS NOT NULL THEN 'completed'
            WHEN melodia_stage = 'result' AND current_melodia_song_sequence = 4 THEN 'results'
            ELSE melodia_stage
          END;
          ALTER TABLE game_state ADD CONSTRAINT game_state_melodia_flow_check
            CHECK (melodia_stage IN ('intro', 'ready', 'song', 'scoring', 'result', 'results', 'completed'));
        END $$
      `;

      await sql`
        DO $migration$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'game_state'::regclass AND attname = 'melodia_pool_rule' AND NOT attisdropped) THEN
            RETURN;
          END IF;
          LOCK TABLE game_state IN ACCESS EXCLUSIVE MODE;
          IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'game_state'::regclass AND attname = 'melodia_pool_rule' AND NOT attisdropped) THEN
            RETURN;
          END IF;

          -- Keep settled scores and ledger intact, but apply the new scoring to any game still in progress.
          IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'melodia_songs'::regclass AND attname = 'singing_points' AND NOT attisdropped)
            AND EXISTS (SELECT 1 FROM game_state WHERE id = 1 AND melodia_settled_at IS NULL) THEN
            WITH recognition AS (
              SELECT winning_team_id AS team_id, SUM(COALESCE(artist_points, 0) + COALESCE(title_points, 0))::INTEGER AS points
              FROM melodia_songs WHERE stage = 'result' GROUP BY winning_team_id
            ), corrected AS (
              SELECT score.team_id, score.points AS previous, COALESCE(recognition.points, 0) AS points
              FROM melodia_team_scores score LEFT JOIN recognition USING (team_id)
            ), changed AS (
              UPDATE melodia_team_scores score SET points = corrected.points
              FROM corrected WHERE score.team_id = corrected.team_id
              RETURNING corrected.team_id, corrected.points - corrected.previous AS delta
            )
            UPDATE solenizant_team_scores score SET points = GREATEST(0, score.points + changed.delta)
            FROM changed WHERE score.team_id = changed.team_id;
            UPDATE game_state SET melodia_winning_team_id = NULL WHERE id = 1;
          END IF;
          ALTER TABLE game_state ADD COLUMN melodia_pool_rule BOOLEAN NOT NULL DEFAULT FALSE;
        END $migration$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS pojedynki_duels (
          id BIGSERIAL PRIMARY KEY,
          sequence SMALLINT NOT NULL UNIQUE CHECK (sequence BETWEEN 0 AND 3),
          stage VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending', 'betting', 'live', 'result')),
          team_a_id VARCHAR(16) CHECK (team_a_id IS NULL OR team_a_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          team_b_id VARCHAR(16) CHECK (team_b_id IS NULL OR team_b_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          winner_team_id VARCHAR(16) CHECK (winner_team_id IS NULL OR winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          started_at TIMESTAMPTZ,
          ended_at TIMESTAMPTZ,
          settled_at TIMESTAMPTZ,
          CONSTRAINT pojedynki_duels_team_pair_check CHECK (team_a_id IS NULL OR team_b_id IS NULL OR team_a_id <> team_b_id)
        )
      `;
      await sql`ALTER TABLE pojedynki_duels ADD COLUMN IF NOT EXISTS
        bet_stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (bet_stake IN (2, 4))`;
      await sql`
        CREATE TABLE IF NOT EXISTS pojedynki_bets (
          id BIGSERIAL PRIMARY KEY,
          duel_id BIGINT NOT NULL REFERENCES pojedynki_duels(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'refunded')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (duel_id, bettor_id)
        )
      `;
      await sql`ALTER TABLE pojedynki_bets ALTER COLUMN stake DROP DEFAULT`;
      await sql`CREATE INDEX IF NOT EXISTS pojedynki_bets_duel_index ON pojedynki_bets (duel_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS familiada_bets (
          match_index SMALLINT NOT NULL CHECK (match_index BETWEEN 0 AND 1),
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL CONSTRAINT familiada_bets_allowed_stake CHECK (stake IN (2, 8)),
          result VARCHAR(8) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          settled_at TIMESTAMPTZ,
          PRIMARY KEY (match_index, bettor_id)
        )
      `;
      await sql`
        DO $migration$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'familiada_bets'::regclass AND conname = 'familiada_bets_allowed_stake') THEN
            LOCK TABLE familiada_bets IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'familiada_bets'::regclass AND conname = 'familiada_bets_allowed_stake') THEN
              ALTER TABLE familiada_bets ALTER COLUMN stake DROP DEFAULT, DROP CONSTRAINT IF EXISTS familiada_bets_stake_check,
                ADD CONSTRAINT familiada_bets_allowed_stake CHECK (stake IN (2, 8));
            END IF;
          END IF;
        END $migration$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS alkoholicy_bets (
          id BIGSERIAL PRIMARY KEY,
          game_number SMALLINT NOT NULL CHECK (game_number IN (1, 2)),
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL CONSTRAINT alkoholicy_bets_allowed_stake CHECK (stake = 2 OR (game_number IN (2, 3) AND stake = 4)),
          result VARCHAR(8) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'refunded')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          settled_at TIMESTAMPTZ,
          UNIQUE (game_number, bettor_id)
        )
      `;
      await sql`
        DO $migration$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'alkoholicy_bets'::regclass AND conname = 'alkoholicy_bets_allowed_stake') THEN
            LOCK TABLE alkoholicy_bets IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'alkoholicy_bets'::regclass AND conname = 'alkoholicy_bets_allowed_stake') THEN
              ALTER TABLE alkoholicy_bets DROP CONSTRAINT IF EXISTS alkoholicy_bets_stake_check,
                ADD CONSTRAINT alkoholicy_bets_allowed_stake CHECK (stake = 2 OR (game_number IN (2, 3) AND stake = 4));
            END IF;
          END IF;
        END $migration$
      `;
      await sql`
        DO $migration$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'alkoholicy_bets'::regclass AND conname = 'alkoholicy_three_markets') THEN
            LOCK TABLE alkoholicy_bets IN ACCESS EXCLUSIVE MODE;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'alkoholicy_bets'::regclass AND conname = 'alkoholicy_three_markets') THEN
              ALTER TABLE alkoholicy_bets DROP CONSTRAINT IF EXISTS alkoholicy_bets_game_number_check,
                ADD CONSTRAINT alkoholicy_three_markets CHECK (game_number IN (1, 2, 3));
            END IF;
          END IF;
        END $migration$
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS gold_nominations (
          voter_id BIGINT PRIMARY KEY REFERENCES players(id),
          candidate_id BIGINT NOT NULL REFERENCES players(id)
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS gold_chip_transfers (
          settlement_id UUID NOT NULL,
          player_id BIGINT NOT NULL REFERENCES players(id),
          previous_tokens NUMERIC(20,4) NOT NULL CHECK (previous_tokens >= 0),
          new_tokens NUMERIC(20,4) NOT NULL CHECK (new_tokens >= 0),
          delta NUMERIC(20,4) NOT NULL CHECK (new_tokens = previous_tokens + delta),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (settlement_id, player_id)
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS gold_stakes (
          round_id UUID NOT NULL,
          game_number SMALLINT NOT NULL CHECK (game_number IN (1, 2)),
          player_id BIGINT NOT NULL REFERENCES players(id),
          team_id VARCHAR(16) NOT NULL,
          choice SMALLINT CHECK (choice BETWEEN 1 AND 6),
          stake NUMERIC(20,4) NOT NULL CHECK (stake = 10),
          payout NUMERIC(20,4) CHECK (payout >= 0),
          settled_at TIMESTAMPTZ,
          PRIMARY KEY (round_id, player_id),
          CHECK ((game_number = 1 AND choice IS NULL) OR (game_number = 2 AND choice IS NOT NULL))
        )
      `;
      await sql`ALTER TABLE sport_challenges ADD COLUMN IF NOT EXISTS score_revision UUID NOT NULL DEFAULT gen_random_uuid()`;
      await sql`ALTER TABLE pojedynki_duels ADD COLUMN IF NOT EXISTS score_revision UUID NOT NULL DEFAULT gen_random_uuid()`;
    })().catch((error: unknown) => {
      schemaPromise = undefined;
      throw error;
    });
  }
  await schemaPromise;
}

export async function createPlayer(input: { nickname: string; teamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  try {
    const rows = (await sql`
      INSERT INTO players (nickname, team_id, tokens)
      VALUES (${input.nickname}, ${input.teamId}, ${STARTING_TOKENS})
      RETURNING id, nickname, team_id, tokens, created_at
    `) as PlayerRow[];
    return toPlayer(rows[0]);
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new NicknameTakenError();
    }
    throw error;
  }
}

export async function getPlayer(playerId: number) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    SELECT id, nickname, team_id, tokens, created_at
    FROM players
    WHERE id = ${playerId} AND active = TRUE
  `) as PlayerRow[];
  return rows[0] ? toPlayer(rows[0]) : null;
}

export async function findActivePlayerByNickname(nickname: string) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    SELECT id, nickname, team_id, tokens, created_at
    FROM players
    WHERE LOWER(nickname) = LOWER(${nickname}) AND active = TRUE
  `) as PlayerRow[];
  return rows[0] ? toPlayer(rows[0]) : null;
}

export async function createSession(input: NewSession) {
  await ensureDatabase();
  const sql = database();
  await sql`DELETE FROM sessions WHERE expires_at <= NOW()`;
  const token = randomBytes(32).toString("base64url");
  const playerId = input.role === "player" ? input.playerId : null;
  await sql`
    INSERT INTO sessions (token, role, player_id, expires_at)
    VALUES (${token}, ${input.role}, ${playerId}, ${input.expiresAt})
  `;
  return token;
}

export async function getSession(token: string | undefined): Promise<Session | null> {
  if (!token || token.length > 64) return null;
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    SELECT token, role, player_id, expires_at
    FROM sessions
    WHERE token = ${token} AND expires_at > NOW()
  `) as SessionRow[];
  return rows[0] ? toSession(rows[0]) : null;
}

export async function revokeSession(token: string | undefined) {
  if (!token || token.length > 64) return;
  await ensureDatabase();
  const sql = database();
  await sql`DELETE FROM sessions WHERE token = ${token}`;
}

export async function getGameSnapshot(viewerPlayerId?: number, options?: { admin: boolean }): Promise<GameSnapshot> {
  await ensureDatabase();
  const sql = database();
  const isAdmin = options?.admin === true && viewerPlayerId === undefined;
  const reads = [
    sql`
      SELECT ROUND(EXTRACT(EPOCH FROM statement_timestamp()) * 1000) AS server_time_ms,
        id, status, started_at, active_segment, solenizant_stage, current_question_index, the_floor_stage, current_the_floor_duel_sequence,
        sport_stage, current_sport_challenge_sequence, current_sport_bonus_sequence,
        melodia_stage, current_melodia_song_sequence, melodia_winning_team_id, melodia_settled_at, melodia_pool_rule,
        pojedynki_stage, current_pojedynki_duel_sequence, familiada_state, familiada_revision, finale_state, finale_revision,
        alkoholicy_state, alkoholicy_revision, gold_state, gold_revision
      FROM game_state
      WHERE id = 1
    ` as SnapshotQuery<GameRow & FamiliadaRow & FinaleRow & AlkoholicyRow & GoldRow>,
    sql`
      SELECT id, nickname, team_id, tokens, created_at
      FROM players
      WHERE active = TRUE
      ORDER BY created_at ASC, id ASC
    ` as SnapshotQuery<PlayerRow>,
    sql`
      SELECT team_id, points
      FROM (${overallTeamScores(sql)}) scores
      ORDER BY CASE team_id
        WHEN 'royal' THEN 1
        WHEN 'ruby' THEN 2
        WHEN 'emerald' THEN 3
        WHEN 'onyx' THEN 4
      END
    ` as SnapshotQuery<TeamScoreRow>,
    sql`SELECT COALESCE(SUM(tokens), 0) AS total_tokens FROM players WHERE active = TRUE` as SnapshotQuery<TotalTokensRow>,
    sql`
      SELECT id, sequence, CASE WHEN category_id IN (
          SELECT jsonb_array_elements_text(${JSON.stringify(THE_FLOOR_CATEGORY_IDS)}::JSONB)
        ) THEN category_id ELSE 'archiwalna' END AS category_id,
        stage, team_a_id, team_b_id, active_team_id, item_index, item_order, bet_stake,
        team_a_time_seconds, team_b_time_seconds, turn_started_at, started_at, ended_at, winner_team_id, settled_at
      FROM the_floor_duels
      ORDER BY sequence
    ` as SnapshotQuery<TheFloorDuelRow>,
    sql`SELECT duel_id, COUNT(*)::INTEGER AS bet_count FROM the_floor_bets GROUP BY duel_id` as SnapshotQuery<TheFloorBetCountRow>,
    sql`SELECT duel_id, target_team_id, result, payout FROM the_floor_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<TheFloorViewerBetRow>,
    sql`SELECT slot, team_a_id, team_b_id FROM sport_pairings ORDER BY slot` as SnapshotQuery<SportPairingRow>,
    sql`SELECT team_id, player_id, player_number FROM sport_player_numbers ORDER BY team_id, player_number` as SnapshotQuery<SportPlayerNumberRow>,
    sql`SELECT id, sequence, pair_slot, stage, winner_team_id, settled_at, score_revision, bet_stake FROM sport_challenges ORDER BY sequence` as SnapshotQuery<SportChallengeRow>,
    sql`SELECT challenge_id, COUNT(*)::INTEGER AS bet_count FROM sport_bets GROUP BY challenge_id` as SnapshotQuery<SportBetCountRow>,
    sql`SELECT challenge_id, target_team_id, result, payout FROM sport_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<SportViewerBetRow>,
    sql`SELECT id, sequence, stage, winner_team_id, points FROM sport_bonus_rounds ORDER BY sequence` as SnapshotQuery<SportBonusRow>,
    sql`SELECT bonus_round_id, team_id, limbs FROM sport_bonus_requirements ORDER BY team_id` as SnapshotQuery<SportBonusRequirementRow>,
    sql`SELECT id, sequence, stage, winning_team_id, artist_points, title_points FROM melodia_songs ORDER BY sequence` as SnapshotQuery<MelodiaSongRow>,
    sql`SELECT team_id, points FROM melodia_team_scores ORDER BY CASE team_id WHEN 'royal' THEN 1 WHEN 'ruby' THEN 2 WHEN 'emerald' THEN 3 WHEN 'onyx' THEN 4 END` as SnapshotQuery<MelodiaTeamScoreRow>,
    sql`
      SELECT SUM(transfer.delta) FILTER (WHERE transfer.delta > 0) AS pool,
        MIN(transfer.delta) FILTER (WHERE transfer.delta > 0) AS reward_min,
        MAX(transfer.delta) FILTER (WHERE transfer.delta > 0) AS reward_max,
        MAX(transfer.delta) FILTER (WHERE transfer.player_id = ${viewerPlayerId ?? null}::BIGINT) AS viewer_delta
      FROM game_state game
      JOIN melodia_songs song ON song.sequence = game.current_melodia_song_sequence
      JOIN melodia_chip_transfers transfer ON transfer.final_song_id = song.id
      WHERE game.id = 1 AND game.melodia_settled_at IS NOT NULL
    ` as SnapshotQuery<MelodiaSettlementRow>,
    sql`SELECT id, sequence, stage, team_a_id, team_b_id, winner_team_id, settled_at, score_revision, bet_stake FROM pojedynki_duels ORDER BY sequence` as SnapshotQuery<PojedynkiDuelRow>,
    sql`SELECT duel_id, COUNT(*)::INTEGER AS bet_count FROM pojedynki_bets GROUP BY duel_id` as SnapshotQuery<PojedynkiBetCountRow>,
    sql`SELECT duel_id, target_team_id, result, payout FROM pojedynki_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<PojedynkiViewerBetRow>,
    sql`
      SELECT match_index, COUNT(*)::INTEGER AS bet_count,
        MAX(target_team_id) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS target,
        MAX(result) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS result,
        MAX(payout) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS payout,
        (MAX(stake) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT))::TEXT AS stake
      FROM familiada_bets GROUP BY match_index
    ` as SnapshotQuery<FamiliadaBetSummary>,
    sql`
      SELECT game_number,
        COUNT(*) FILTER (WHERE result = 'pending')::INTEGER AS pending,
        COUNT(*) FILTER (WHERE result = 'won')::INTEGER AS won,
        COUNT(*) FILTER (WHERE result = 'lost')::INTEGER AS lost,
        COUNT(*) FILTER (WHERE result = 'refunded')::INTEGER AS refunded,
        MAX(target_team_id) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS target,
        MAX(result) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS result,
        MAX(payout) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS payout
      FROM alkoholicy_bets GROUP BY game_number
    ` as SnapshotQuery<AlkoholicyBetSummary>,
    sql`
      SELECT vote.candidate_id, COUNT(*)::INTEGER AS votes, COALESCE(BOOL_OR(vote.voter_id = ${viewerPlayerId ?? null}::BIGINT), FALSE) AS viewer_vote
      FROM gold_nominations vote
      JOIN players voter ON voter.id = vote.voter_id AND voter.active
      JOIN players candidate ON candidate.id = vote.candidate_id AND candidate.active
      WHERE ${isAdmin}::BOOLEAN OR vote.voter_id = ${viewerPlayerId ?? null}::BIGINT
      GROUP BY vote.candidate_id
    ` as SnapshotQuery<GoldVoteSummary>,
    sql`
      SELECT stake.game_number AS game, stake.player_id, player.nickname, stake.team_id, stake.choice, stake.settled_at
      FROM game_state game JOIN gold_stakes stake ON stake.round_id IN (
        (game.gold_state->>'firstEscrowId')::UUID, (game.gold_state->>'sixRoundId')::UUID
      )
      JOIN players player ON player.id = stake.player_id
      WHERE game.id = 1 ORDER BY player.id
    ` as SnapshotQuery<GoldStakeView>,

  ] as const;
  const [gameRows, playerRows, teamScoreRows, totalTokenRows, floorDuelRows, floorBetCountRows, viewerBetRows, sportPairingRows, sportPlayerNumberRows, sportChallengeRows, sportBetCountRows, sportViewerBetRows, sportBonusRows, sportBonusRequirementRows, melodiaSongRows, melodiaTeamScoreRows, melodiaSettlementRows, pojedynkiDuelRows, pojedynkiBetCountRows, pojedynkiViewerBetRows, familiadaBets, alkoholicyBets, goldVotes, goldStakes] = await sql.transaction([...reads], {
    isolationLevel: "RepeatableRead",
    readOnly: true,
  }) as unknown as SnapshotRows<typeof reads>;

  if (!gameRows[0]) {
    throw new Error("Game state could not be loaded.");
  }
  const game = toGameState(gameRows[0]);
  const floorDuels = floorDuelRows.map((row) => toTheFloorDuel(
    row,
    floorBetCountRows.find((count) => count.duel_id === row.id)?.bet_count ?? 0,
    viewerBetRows.find((bet) => bet.duel_id === row.id),
  ));
  const currentFloorDuel = floorDuels.find((duel) => duel.sequence === game.currentTheFloorDuelSequence) ?? null;
  const currentFloorOrder = floorDuelRows.find((row) => row.id === currentFloorDuel?.id)?.item_order;
  const floorContent = game.activeSegment === "the-floor" && currentFloorDuel && game.theFloorStage !== "results"
    ? await getTheFloorContent(currentFloorDuel.categoryId, game.theFloorStage === "live" ? currentFloorDuel.itemIndex : null, isAdmin, currentFloorOrder?.[currentFloorDuel.itemIndex])
    : null;
  const catalogErrors = isAdmin && game.activeSegment === "the-floor" && game.theFloorStage === "intro"
    ? (await getTheFloorCatalogStatus()).errors : undefined;
  const theFloor: TheFloorState = { serverTime: Number(gameRows[0].server_time_ms ?? Date.now()), stage: game.theFloorStage, currentDuel: currentFloorDuel, duels: floorDuels, content: floorContent, catalogErrors };
  const sportChallenges = sportChallengeRows.map((row) => toSportChallenge(
    row,
    sportBetCountRows.find((count) => count.challenge_id === row.id)?.bet_count ?? 0,
    sportViewerBetRows.find((bet) => bet.challenge_id === row.id),
  ));
  const sportBonuses = sportBonusRows.map((row) => toSportBonusRound(row, sportBonusRequirementRows));
  const sport: SportState = {
    stage: game.sportStage === "result" && sportChallengeRows.some((row) =>
      row.sequence === game.currentSportChallengeSequence && !row.settled_at) ? "live" : game.sportStage,
    currentChallenge: sportChallenges.find((challenge) => challenge.sequence === game.currentSportChallengeSequence) ?? null,
    challenges: sportChallenges,
    currentBonus: sportBonuses.find((bonus) => bonus.sequence === game.currentSportBonusSequence) ?? null,
    bonuses: sportBonuses,
    pairings: sportPairingRows.map(toSportPairing),
    playerNumbers: sportPlayerNumberRows.map(toSportPlayerNumber),
  };
  const melodiaSongs = melodiaSongRows.map(toMelodiaSong);
  const melodiaScores: MelodiaTeamScore[] = melodiaTeamScoreRows.map((row) => ({ teamId: row.team_id, points: row.points }));
  const highestMelodiaScore = Math.max(0, ...melodiaScores.map((score) => score.points));
  const leadingTeamIds = melodiaScores.filter((score) => score.points === highestMelodiaScore).map((score) => score.teamId);
  const finalResults = game.melodiaStage === "results" || game.melodiaStage === "completed";

  const winningTeamId = finalResults ? game.melodiaWinningTeamId : null;
  const settled = melodiaSettlementRows[0];
  const completedLegacy = Boolean(game.melodiaSettledAt && !gameRows[0].melodia_pool_rule);
  let reward: MelodiaState["reward"] = null;
  let transferPreview: MelodiaState["transferPreview"];
  let insufficientPlayers: MelodiaState["insufficientPlayers"];
  if (winningTeamId && !game.melodiaSettledAt) {
    const ordered = [...playerRows].sort((a, b) => a.id - b.id);
    const winners = ordered.filter((player) => player.team_id === winningTeamId);
    const losers = ordered.filter((player) => player.team_id !== winningTeamId);
    if (winners.length && losers.length) {
      const units = BigInt(losers.length) * BigInt(MELODIA_LOSER_CONTRIBUTION * 10_000);
      const count = BigInt(winners.length);
      const base = units / count;
      const remainder = units % count;
      const decimal = (amount: bigint) => (amount / 10_000n) + "." + String(amount % 10_000n).padStart(4, "0");
      reward = { pool: decimal(units), min: decimal(base), max: decimal(base + (remainder > 0n ? 1n : 0n)) };
      if (isAdmin) {
        transferPreview = [
          ...winners.map((player, index) => ({ playerId: player.id, delta: decimal(base + (BigInt(index) < remainder ? 1n : 0n)) })),
          ...losers.map((player) => ({ playerId: player.id, delta: "-" + MELODIA_LOSER_CONTRIBUTION })),
        ];
        insufficientPlayers = losers.filter((player) => compareChipBalances(normalizeChipAmount(player.tokens), String(MELODIA_LOSER_CONTRIBUTION)) < 0)
          .map((player) => player.id);
      }
    }
  } else if (!completedLegacy && settled?.pool != null && settled.reward_min != null && settled.reward_max != null) {
    reward = { pool: settled.pool, min: settled.reward_min, max: settled.reward_max };
  }
  const melodia: MelodiaState = {
    stage: game.melodiaStage,
    currentSong: melodiaSongs.find((song) => song.sequence === game.currentMelodiaSongSequence) ?? null,
    songs: melodiaSongs,
    teamScores: melodiaScores,
    leadingTeamIds: finalResults ? leadingTeamIds : [],
    winningTeamId,
    settledAt: game.melodiaSettledAt,
    reward,
    transferPreview,
    insufficientPlayers,
    viewerDelta: settled?.viewer_delta ?? null,
    completedLegacy,
  };
  const pojedynkiDuels = pojedynkiDuelRows.map((row) => toPojedynkiDuel(
    row,
    pojedynkiBetCountRows.find((count) => count.duel_id === row.id)?.bet_count ?? 0,
    pojedynkiViewerBetRows.find((bet) => bet.duel_id === row.id),
  ));
  const pojedynki: PojedynkiState = {
    stage: game.pojedynkiStage === "result" && pojedynkiDuelRows.some((row) =>
      row.sequence === game.currentPojedynkiDuelSequence && !row.settled_at) ? "live" : game.pojedynkiStage,
    currentDuel: pojedynkiDuels.find((duel) => duel.sequence === game.currentPojedynkiDuelSequence) ?? null,
    duels: pojedynkiDuels,
  };
  const teamScores = teamScoreRows.map(toTeamScore);
  const players = playerRows.map(toPlayer);
  const { legacyDuelAward: _legacyDuelAward, duelBetStakes, ...alkoholicy } = normalizeAlkoholicy(gameRows[0].alkoholicy_state);
  const duelMarkets: [AlkoholicyMarket, AlkoholicyMarket] = [
    alkoholicyMarket(duelBetStakes?.[0] ?? LEGACY_DUEL_BET_STAKE, alkoholicyBets.find((row) => row.game_number === 2)),
    alkoholicyMarket(duelBetStakes?.[1] ?? LEGACY_DUEL_BET_STAKE, alkoholicyBets.find((row) => row.game_number === 3)),
  ];
  return {
    game,
    players,
    teamScores,
    totalTokens: normalizeChipAmount(totalTokenRows[0]?.total_tokens ?? "0"),
    theFloor,
    sport,
    melodia,
    pojedynki,
    familiada: getFamiliadaSnapshot(gameRows[0].familiada_state, gameRows[0].familiada_revision, familiadaBets, isAdmin),
    alkoholicy: {
      ...alkoholicy,
      revision: gameRows[0].alkoholicy_revision,
      charadesLeaders: charadesLeaders(alkoholicy),
      charadesMarket: alkoholicyMarket(CHARADES_BET_STAKE, alkoholicyBets.find((row) => row.game_number === 1)),
      duelMarket: duelMarkets[alkoholicy.duelIndex],
      duelMarkets,
    },
    goldChallenge: getGoldSnapshot(gameRows[0].gold_state, gameRows[0].gold_revision, players, goldVotes, goldStakes, viewerPlayerId, isAdmin),
    finale: getFinaleSnapshot(gameRows[0].finale_state, gameRows[0].finale_revision, teamScores, isAdmin),
  };
}

export async function startGame() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    UPDATE game_state
    SET status = 'started', started_at = COALESCE(started_at, NOW())
    WHERE id = 1
    RETURNING id, status, started_at, active_segment, solenizant_stage, current_question_index, the_floor_stage, current_the_floor_duel_sequence,
      sport_stage, current_sport_challenge_sequence, current_sport_bonus_sequence, melodia_stage, current_melodia_song_sequence, melodia_winning_team_id, melodia_settled_at,
      pojedynki_stage, current_pojedynki_duel_sequence
  `) as GameRow[];
  return toGameState(rows[0]);
}

/** Persists active segment selection only; individual segment progress stays untouched. */
export async function setActiveSegment(segmentId: SegmentId) {
  await ensureDatabase();
  const sql = database();
  await sql`
    WITH changed AS (
      UPDATE game_state
      SET active_segment = ${segmentId}
      WHERE id = 1
      RETURNING active_segment
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'segment_navigation', jsonb_build_object('segmentId', active_segment)
    FROM changed
  `;
}

/** Resets only Solenizant scores and progress; player accounts and chip balances are untouched. */
export async function restartSolenizantSegment() {
  await ensureDatabase();
  const sql = database();
  await sql`
    WITH cleared_awards AS (
      DELETE FROM solenizant_question_awards
      RETURNING question_index
    ),
    reset_scores AS (
      UPDATE solenizant_team_scores
      SET points = 0
      RETURNING team_id
    ),
    reset_state AS (
      UPDATE game_state
      SET active_segment = 'solenizant', solenizant_stage = 'intro', current_question_index = 0
      WHERE id = 1
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'solenizant_restart', jsonb_build_object('clearedAwards', (SELECT COUNT(*) FROM cleared_awards))
    FROM reset_state
  `;
}

/** Performs the destructive game reset while retaining active player identities and their teams. */
export async function resetGame() {
  await ensureDatabase();
  const sql = database();
  await runWithGameLock(sql, sql`
    WITH cleared_awards AS (
      DELETE FROM solenizant_question_awards
      RETURNING question_index
    ),
    cleared_floor_bets AS (
      DELETE FROM the_floor_bets
      RETURNING id
    ),
    cleared_floor_duels AS (
      DELETE FROM the_floor_duels
      RETURNING id
    ),
    cleared_sport_transfers AS (
      DELETE FROM sport_chip_transfers
      RETURNING id
    ),
    cleared_sport_bets AS (
      DELETE FROM sport_bets
      RETURNING id
    ),
    cleared_sport_requirements AS (
      DELETE FROM sport_bonus_requirements
      RETURNING bonus_round_id
    ),
    cleared_sport_bonuses AS (
      DELETE FROM sport_bonus_rounds
      RETURNING id
    ),
    cleared_sport_challenges AS (
      DELETE FROM sport_challenges
      RETURNING id
    ),
    cleared_sport_numbers AS (
      DELETE FROM sport_player_numbers
      RETURNING player_id
    ),
    cleared_sport_pairings AS (
      DELETE FROM sport_pairings
      RETURNING slot
    ),
    cleared_melodia_songs AS (
      DELETE FROM melodia_songs
      RETURNING id
    ),
    reset_melodia_scores AS (
      UPDATE melodia_team_scores
      SET points = 0
      RETURNING team_id
    ),
    cleared_pojedynki_bets AS (
      DELETE FROM pojedynki_bets
      RETURNING id
    ),
    cleared_pojedynki_duels AS (
      DELETE FROM pojedynki_duels
      RETURNING id
    ),
    cleared_familiada_bets AS (
      DELETE FROM familiada_bets
      RETURNING match_index
    ),
    cleared_alkoholicy_bets AS (
      DELETE FROM alkoholicy_bets RETURNING id
    ),
    cleared_gold_nominations AS (
      DELETE FROM gold_nominations RETURNING voter_id
    ),
    closed_gold_escrow AS (
      UPDATE gold_stakes stake SET payout = CASE WHEN player.active THEN 0 ELSE stake.stake END, settled_at = NOW()
      FROM game_state game, players player
      WHERE game.id = 1 AND player.id = stake.player_id AND stake.settled_at IS NULL
        AND stake.round_id IN ((game.gold_state->>'firstEscrowId')::UUID, (game.gold_state->>'sixRoundId')::UUID)
      RETURNING stake.player_id, stake.payout
    ),
    refunded_inactive_players AS (
      UPDATE players player SET tokens = player.tokens + escrow.payout
      FROM closed_gold_escrow escrow WHERE player.id = escrow.player_id AND NOT player.active AND escrow.payout > 0
    ),
    reset_scores AS (
      UPDATE solenizant_team_scores
      SET points = 0
      RETURNING team_id
    ),
    reset_players AS (
      UPDATE players
      SET tokens = ${STARTING_TOKENS}
      WHERE active = TRUE
      RETURNING id
    ),
    reset_state AS (
      UPDATE game_state
      SET
        status = 'waiting',
        started_at = NULL,
        active_segment = 'solenizant',
        solenizant_stage = 'intro',
        current_question_index = 0,
        the_floor_stage = 'intro',
        current_the_floor_duel_sequence = 0,
        sport_stage = 'intro',
        current_sport_challenge_sequence = 0,
        current_sport_bonus_sequence = 0,
        melodia_stage = 'intro',
        current_melodia_song_sequence = 0,
        melodia_winning_team_id = NULL,
        melodia_settled_at = NULL,
        melodia_pool_rule = FALSE,
        pojedynki_stage = 'intro',
        current_pojedynki_duel_sequence = 0,
        familiada_state = NULL,
        familiada_revision = gen_random_uuid(),
        finale_state = NULL,
        finale_revision = gen_random_uuid(),
        alkoholicy_state = NULL,
        alkoholicy_revision = gen_random_uuid(),
        gold_state = NULL,
        gold_revision = gen_random_uuid()
      WHERE id = 1
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT
      'game_reset',
      jsonb_build_object(
        'playersReset', (SELECT COUNT(*) FROM reset_players),
        'clearedAwards', (SELECT COUNT(*) FROM cleared_awards),
        'clearedFloorDuels', (SELECT COUNT(*) FROM cleared_floor_duels),
        'clearedSportChallenges', (SELECT COUNT(*) FROM cleared_sport_challenges),
        'clearedMelodiaSongs', (SELECT COUNT(*) FROM cleared_melodia_songs),
        'clearedPojedynkiDuels', (SELECT COUNT(*) FROM cleared_pojedynki_duels),
        'clearedFamiliadaBets', (SELECT COUNT(*) FROM cleared_familiada_bets),
        'clearedAlkoholicyBets', (SELECT COUNT(*) FROM cleared_alkoholicy_bets),
        'clearedGoldNominations', (SELECT COUNT(*) FROM cleared_gold_nominations),
        'closedGoldEscrow', (SELECT COUNT(*) FROM closed_gold_escrow)
      )
    FROM reset_state
  `);
}

/** Sets an exact active-player chip balance and records the administrator adjustment atomically. */
export async function setPlayerTokens(input: { playerId: number; tokens: string }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH previous AS (
      SELECT id, tokens
      FROM players
      WHERE id = ${input.playerId} AND active = TRUE
      FOR UPDATE
    ),
    updated AS (
      UPDATE players
      SET tokens = ${input.tokens}::NUMERIC(20,4)
      FROM previous
      WHERE players.id = previous.id
      RETURNING players.id AS player_id, previous.tokens AS previous_tokens, players.tokens AS new_tokens
    ),
    recorded_adjustment AS (
      INSERT INTO chip_adjustments (player_id, previous_tokens, new_tokens, adjustment)
      SELECT player_id, previous_tokens, new_tokens, new_tokens - previous_tokens
      FROM updated
      RETURNING player_id
    ),
    recorded_action AS (
      INSERT INTO admin_actions (action, details)
      SELECT
        'player_chip_adjustment',
        jsonb_build_object(
          'playerId', player_id,
          'previousTokens', previous_tokens::TEXT,
          'newTokens', new_tokens::TEXT
        )
      FROM updated
      RETURNING id
    )
    SELECT player_id, previous_tokens, new_tokens
    FROM updated
  `) as ChipAdjustmentRow[];
  return rows[0]
    ? {
        playerId: rows[0].player_id,
        previousTokens: normalizeChipAmount(rows[0].previous_tokens),
        newTokens: normalizeChipAmount(rows[0].new_tokens),
      }
    : null;
}

/** Soft-removes a player and revokes all of their browser sessions while retaining game history. */
export async function deactivatePlayer(playerId: number) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH removed AS (
      UPDATE players
      SET active = FALSE, removed_at = NOW()
      WHERE id = ${playerId} AND active = TRUE
      RETURNING id, nickname
    ),
    revoked_sessions AS (
      DELETE FROM sessions
      WHERE player_id IN (SELECT id FROM removed)
      RETURNING player_id
    ),
    recorded_action AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'player_removed', jsonb_build_object('playerId', id, 'nickname', nickname)
      FROM removed
      RETURNING id
    )
    SELECT id, nickname
    FROM removed
  `) as RemovedPlayerRow[];
  return rows[0] ?? null;
}

export async function startSolenizantSegment() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    UPDATE game_state
    SET active_segment = 'solenizant', solenizant_stage = 'question', current_question_index = 0
    WHERE id = 1
      AND status = 'started'
      AND active_segment = 'solenizant'
      AND solenizant_stage = 'intro'
    RETURNING id, status, started_at, active_segment, solenizant_stage, current_question_index, the_floor_stage, current_the_floor_duel_sequence,
      sport_stage, current_sport_challenge_sequence, current_sport_bonus_sequence, melodia_stage, current_melodia_song_sequence, melodia_winning_team_id, melodia_settled_at,
      pojedynki_stage, current_pojedynki_duel_sequence
  `) as GameRow[];
  return rows[0] ? toGameState(rows[0]) : null;
}

export async function openSolenizantScoring(questionIndex: number) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    UPDATE game_state
    SET solenizant_stage = 'scoring'
    WHERE id = 1
      AND status = 'started'
      AND active_segment = 'solenizant'
      AND solenizant_stage = 'question'
      AND current_question_index = ${questionIndex}
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

export async function confirmSolenizantScore(input: { questionIndex: number; teamIds: TeamId[] }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH new_award AS (
      INSERT INTO solenizant_question_awards (question_index)
      SELECT ${input.questionIndex}
      WHERE EXISTS (
        SELECT 1
        FROM game_state
        WHERE id = 1
          AND status = 'started'
          AND active_segment = 'solenizant'
          AND solenizant_stage = 'scoring'
          AND current_question_index = ${input.questionIndex}
      )
      ON CONFLICT (question_index) DO NOTHING
      RETURNING question_index
    ),
    updated_scores AS (
      UPDATE solenizant_team_scores
      SET points = points + CASE
        WHEN team_id = 'royal' AND ${input.teamIds.includes("royal")} THEN 1
        WHEN team_id = 'ruby' AND ${input.teamIds.includes("ruby")} THEN 1
        WHEN team_id = 'emerald' AND ${input.teamIds.includes("emerald")} THEN 1
        WHEN team_id = 'onyx' AND ${input.teamIds.includes("onyx")} THEN 1
        ELSE 0
      END
      WHERE EXISTS (SELECT 1 FROM new_award)
      RETURNING team_id
    ),
    advanced_state AS (
      UPDATE game_state
      SET
        solenizant_stage = CASE
          WHEN current_question_index = ${SOLENIZANT_LAST_QUESTION_INDEX} THEN 'results'
          ELSE 'question'
        END,
        current_question_index = CASE
          WHEN current_question_index = ${SOLENIZANT_LAST_QUESTION_INDEX} THEN current_question_index
          ELSE current_question_index + 1
        END
      WHERE id = 1 AND EXISTS (SELECT 1 FROM new_award)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced_state) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Seeds six durable category slots and opens The Floor participant setup. */
export async function startTheFloorSegment() {
  await ensureDatabase();
  const { available } = await getTheFloorCatalogStatus();
  if (!available.length) return "no-categories";
  const sql = database();
  const rows = (await sql`
    WITH opened AS (
      UPDATE game_state
      SET active_segment = 'the-floor', the_floor_stage = 'setup', current_the_floor_duel_sequence = 0
      WHERE id = 1 AND status = 'started' AND the_floor_stage = 'intro'
      RETURNING id
    ),
    seeded AS (
      INSERT INTO the_floor_duels (sequence, category_id)
      SELECT (position - 1)::SMALLINT, category_id
      FROM opened CROSS JOIN jsonb_array_elements_text(${JSON.stringify(available)}::JSONB) WITH ORDINALITY AS category(category_id, position)
      ON CONFLICT (sequence) DO NOTHING
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'the_floor_started', jsonb_build_object('seededSlots', (SELECT COUNT(*) FROM seeded))
    FROM opened
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0 ? "started" : "conflict";
}

/** Clears only The Floor state, bets, and results while preserving players and balances. */
export async function restartTheFloorSegment() {
  await ensureDatabase();
  const sql = database();
  await runWithGameLock(sql, sql`
    WITH pending_refunds AS (
      SELECT bettor_id, SUM(stake) AS refund
      FROM the_floor_bets
      WHERE result = 'pending'
      GROUP BY bettor_id
    ),
    refunded_players AS (
      UPDATE players player
      SET tokens = player.tokens + pending_refunds.refund
      FROM pending_refunds
      WHERE player.id = pending_refunds.bettor_id
      RETURNING player.id
    ),
    cleared_bets AS (
      DELETE FROM the_floor_bets
      RETURNING id
    ),
    cleared_duels AS (
      DELETE FROM the_floor_duels
      RETURNING id
    ),
    reset_state AS (
      UPDATE game_state
      SET active_segment = 'the-floor', the_floor_stage = 'intro', current_the_floor_duel_sequence = 0
      WHERE id = 1
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'the_floor_restart', jsonb_build_object('clearedDuels', (SELECT COUNT(*) FROM cleared_duels), 'refundedPendingBets', (SELECT COUNT(*) FROM refunded_players))
    FROM reset_state
  `);
}

/** Assigns two teams to the currently selected category and opens betting. */
export async function configureTheFloorDuel(input: { teamAId: TeamId; teamBId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const decks = JSON.stringify(await getTheFloorDeckKeys());
  const rows = (await sql`
    WITH current_game AS (
      SELECT current_the_floor_duel_sequence
      FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'the-floor' AND the_floor_stage = 'setup'
      FOR UPDATE
    ),
    configured AS (
      UPDATE the_floor_duels AS duel
      SET team_a_id = ${input.teamAId}, team_b_id = ${input.teamBId}, stage = 'betting', bet_stake = ${STANDARD_DUEL_BET_STAKE}::NUMERIC, item_index = 0,
        item_order = (SELECT jsonb_agg(item ORDER BY random())
          FROM jsonb_array_elements_text((${decks}::JSONB) -> duel.category_id) AS items(item)),
        team_a_time_seconds = ${THE_FLOOR_DUEL_SECONDS}, team_b_time_seconds = ${THE_FLOOR_DUEL_SECONDS},
        active_team_id = NULL, turn_started_at = NULL, started_at = NULL, ended_at = NULL, winner_team_id = NULL, settled_at = NULL
      FROM current_game
      WHERE duel.sequence = current_game.current_the_floor_duel_sequence
        AND jsonb_array_length((${decks}::JSONB) -> duel.category_id) > 0
        AND duel.stage = 'pending'
        AND ${input.teamAId} <> ${input.teamBId}
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state
      SET the_floor_stage = 'betting'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM configured)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Debits the stake stored for the open duel only once from a player outside the competing teams. */
export async function placeTheFloorBet(input: { bettorId: number; targetTeamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await runWithGameLock(sql, sql`
    WITH current_duel AS (
      SELECT duel.id, duel.team_a_id, duel.team_b_id, duel.bet_stake
      FROM the_floor_duels duel
      JOIN game_state game ON game.current_the_floor_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'the-floor'
        AND game.the_floor_stage = 'betting' AND duel.stage = 'betting'
      FOR UPDATE
    ),
    eligible AS (
      SELECT current_duel.id, current_duel.bet_stake
      FROM current_duel
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= current_duel.bet_stake
      WHERE bettor.team_id NOT IN (current_duel.team_a_id, current_duel.team_b_id)
        AND ${input.targetTeamId} IN (current_duel.team_a_id, current_duel.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM the_floor_bets prior WHERE prior.duel_id = current_duel.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players
      SET tokens = tokens - eligible.bet_stake
      FROM eligible
      WHERE players.id = ${input.bettorId}
      RETURNING players.id
    ),
    inserted AS (
      INSERT INTO the_floor_bets (duel_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, eligible.bet_stake
      FROM eligible
      WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `)) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

function connectedFloorDevices(sql: ReturnType<typeof database>) {
  return sql`
    SELECT presence.*, session.role, session.player_id
    FROM floor_device_presence presence
    JOIN sessions session ON session.token = presence.session_token AND session.expires_at > NOW()
    LEFT JOIN players player ON player.id = session.player_id
    WHERE presence.seen_at > NOW() - ${THE_FLOOR_PRESENCE_SECONDS} * INTERVAL '1 second'
      AND (session.role = 'admin' OR player.active)
  `;
}

export async function reportTheFloorPreload(
  sessionToken: string, deviceId: string, version: string | null, decoded: number, failed: string[], isAdmin: boolean,
): Promise<TheFloorPreloadStatus | null> {
  await ensureDatabase();
  const sql = database();
  const manifest = version ? await getTheFloorPreloadManifest() : null;
  if (manifest && (manifest.version !== version || decoded + failed.length > manifest.urls.length ||
    failed.some((url) => !manifest.urls.includes(url)))) return null;

  const rows = await runWithGameLock(sql, sql`
    WITH reported AS (
      INSERT INTO floor_device_presence (session_token, device_id, catalog_version, decoded, failed_assets)
      SELECT token, ${deviceId}::UUID, ${version}::TEXT, ${decoded}::INTEGER, ${JSON.stringify(failed)}::JSONB
      FROM sessions WHERE token = ${sessionToken} AND expires_at > NOW()
      ON CONFLICT (session_token, device_id) DO UPDATE
        SET catalog_version = EXCLUDED.catalog_version, decoded = EXCLUDED.decoded,
          failed_assets = EXCLUDED.failed_assets, seen_at = NOW()
      RETURNING device_id
    ), devices AS (
      SELECT player_id, catalog_version, failed_assets, catalog_version IS NOT DISTINCT FROM ${version}::TEXT
        AND decoded = ${manifest?.urls.length ?? -1} AND ${isAdmin}::BOOLEAN AS ready
      FROM (${connectedFloorDevices(sql)}) connected WHERE role = 'player' AND ${isAdmin}::BOOLEAN
    ), players AS (
      SELECT player_id, BOOL_AND(ready) AS ready FROM devices GROUP BY player_id
    )
    SELECT (SELECT COUNT(*)::INTEGER FROM players) AS players,
      (SELECT COUNT(*)::INTEGER FROM players WHERE ready) AS "readyPlayers",
      (SELECT COUNT(*)::INTEGER FROM devices) AS devices,
      (SELECT COUNT(*)::INTEGER FROM devices WHERE ready) AS "readyDevices",
      COALESCE((SELECT jsonb_agg(DISTINCT asset) FROM devices
        CROSS JOIN jsonb_array_elements_text(failed_assets) AS failures(asset) WHERE catalog_version = ${version}::TEXT),
        '[]'::JSONB) AS "failedAssets"
    FROM reported
  `) as TheFloorPreloadStatus[];
  return rows[0] ?? null;
}

/** Closes optional betting and starts team A's timer once all connected devices are ready. */
export async function startTheFloorDuel(sessionToken: string, deviceId: string) {
  await ensureDatabase();
  const manifest = await getTheFloorPreloadManifest();
  if (manifest.issues.length) return "assets";
  const sql = database();
  const rows = (await runWithGameLock(sql, sql`
    WITH connected AS (
      ${connectedFloorDevices(sql)}
    ),
    ready AS (
      SELECT EXISTS (
        SELECT 1 FROM connected WHERE role = 'admin' AND session_token = ${sessionToken} AND device_id = ${deviceId}::UUID
          AND catalog_version = ${manifest.version} AND decoded = ${manifest.urls.length}
      ) AND NOT EXISTS (
        SELECT 1 FROM connected WHERE role = 'player' AND (catalog_version IS DISTINCT FROM ${manifest.version} OR decoded <> ${manifest.urls.length})
      ) AS ok
    ),
    current_duel AS (
      SELECT duel.id, duel.team_a_id, duel.team_b_id
      FROM the_floor_duels duel
      JOIN game_state game ON game.current_the_floor_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'the-floor'
        AND game.the_floor_stage = 'betting' AND duel.stage = 'betting'
      FOR UPDATE
    ),
    started AS (
      UPDATE the_floor_duels duel
      SET stage = 'live', active_team_id = current_duel.team_a_id, turn_started_at = NOW(), started_at = NOW()
      FROM current_duel
      WHERE duel.id = current_duel.id
        AND (SELECT ok FROM ready)
        AND current_duel.team_a_id IS NOT NULL AND current_duel.team_b_id IS NOT NULL
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state
      SET the_floor_stage = 'live'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM started)
      RETURNING id
    )
    SELECT CASE WHEN EXISTS (SELECT 1 FROM advanced) THEN 'started'
      WHEN NOT (SELECT ok FROM ready) THEN 'loading' ELSE 'conflict' END AS status
  `)) as { status: "started" | "loading" | "conflict" }[];
  return rows[0].status;
}

type TheFloorActionRow = { id: number; stage: TheFloorDuelStage };

/** Materializes elapsed server time and applies a team correct-answer switch or pass penalty. */
export async function advanceTheFloorDuel(action: "correct" | "pass") {
  await ensureDatabase();
  const itemCounts = JSON.stringify(await getTheFloorItemCounts());
  const sql = database();
  const rows = (await sql`
    WITH locked AS (
      SELECT duel.*
      FROM the_floor_duels duel
      JOIN game_state game ON game.current_the_floor_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'the-floor'
        AND game.the_floor_stage = 'live' AND duel.stage = 'live'
      FOR UPDATE
    ),
    elapsed AS (
      SELECT locked.*,
        GREATEST(0, team_a_time_seconds - CASE WHEN active_team_id = team_a_id THEN FLOOR(EXTRACT(EPOCH FROM NOW() - turn_started_at))::INTEGER ELSE 0 END) AS current_a,
        GREATEST(0, team_b_time_seconds - CASE WHEN active_team_id = team_b_id THEN FLOOR(EXTRACT(EPOCH FROM NOW() - turn_started_at))::INTEGER ELSE 0 END) AS current_b
      FROM locked
    ),
    prepared AS (
      SELECT elapsed.*,
        GREATEST(0, current_a - CASE WHEN ${action} = 'pass' AND active_team_id = team_a_id THEN ${THE_FLOOR_PASS_PENALTY_SECONDS} ELSE 0 END) AS next_a,
        GREATEST(0, current_b - CASE WHEN ${action} = 'pass' AND active_team_id = team_b_id THEN ${THE_FLOOR_PASS_PENALTY_SECONDS} ELSE 0 END) AS next_b
      FROM elapsed
    ),
    changed AS (
      UPDATE the_floor_duels duel
      SET
        team_a_time_seconds = prepared.next_a,
        team_b_time_seconds = prepared.next_b,
        item_index = CASE
          WHEN prepared.next_a = 0 OR prepared.next_b = 0 THEN duel.item_index
          ELSE (duel.item_index + 1) % GREATEST(1, COALESCE(jsonb_array_length(duel.item_order), (${itemCounts}::JSONB ->> duel.category_id)::INTEGER))
        END,
        stage = CASE WHEN prepared.next_a = 0 OR prepared.next_b = 0 THEN 'result' ELSE 'live' END,
        active_team_id = CASE
          WHEN prepared.next_a = 0 OR prepared.next_b = 0 THEN NULL
          WHEN ${action} = 'correct' AND prepared.active_team_id = prepared.team_a_id THEN prepared.team_b_id
          WHEN ${action} = 'correct' AND prepared.active_team_id = prepared.team_b_id THEN prepared.team_a_id
          ELSE prepared.active_team_id
        END,
        turn_started_at = CASE WHEN prepared.next_a = 0 OR prepared.next_b = 0 THEN NULL ELSE NOW() END,
        ended_at = CASE WHEN prepared.next_a = 0 OR prepared.next_b = 0 THEN NOW() ELSE NULL END
      FROM prepared
      WHERE duel.id = prepared.id
      RETURNING duel.id, duel.stage
    ),
    advanced_game AS (
      UPDATE game_state
      SET the_floor_stage = CASE WHEN (SELECT stage FROM changed) = 'result' THEN 'result' ELSE 'live' END
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed)
      RETURNING id
    )
    SELECT changed.id, changed.stage
    FROM changed
    WHERE EXISTS (SELECT 1 FROM advanced_game)
  `) as TheFloorActionRow[];
  return rows[0] ?? null;
}

/** Ends a live team duel when the persistent server clock has reached zero; the admin then confirms its winner. */
export async function finishExpiredTheFloorDuel() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH locked AS (
      SELECT duel.*
      FROM the_floor_duels duel
      JOIN game_state game ON game.current_the_floor_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.active_segment = 'the-floor' AND game.the_floor_stage = 'live' AND duel.stage = 'live'
      FOR UPDATE
    ),
    elapsed AS (
      SELECT locked.*,
        GREATEST(0, team_a_time_seconds - CASE WHEN active_team_id = team_a_id THEN FLOOR(EXTRACT(EPOCH FROM NOW() - turn_started_at))::INTEGER ELSE 0 END) AS current_a,
        GREATEST(0, team_b_time_seconds - CASE WHEN active_team_id = team_b_id THEN FLOOR(EXTRACT(EPOCH FROM NOW() - turn_started_at))::INTEGER ELSE 0 END) AS current_b
      FROM locked
    ),
    changed AS (
      UPDATE the_floor_duels duel
      SET team_a_time_seconds = elapsed.current_a, team_b_time_seconds = elapsed.current_b,
        stage = 'result', active_team_id = NULL, turn_started_at = NULL, ended_at = NOW()
      FROM elapsed
      WHERE duel.id = elapsed.id AND (elapsed.current_a = 0 OR elapsed.current_b = 0)
      RETURNING duel.id, duel.stage
    ),
    advanced_game AS (
      UPDATE game_state SET the_floor_stage = 'result'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed)
      RETURNING id
    )
    SELECT changed.id, changed.stage FROM changed WHERE EXISTS (SELECT 1 FROM advanced_game)
  `) as TheFloorActionRow[];
  return rows[0] ?? null;
}

export function endTheFloorDuel(winnerTeamId: TeamId) {
  return settleStandardTeamDuel("the-floor", winnerTeamId);
}

/** Opens the next unconfigured duel slot, or the segment-summary stage after all six categories. */
export async function moveToNextTheFloorDuel() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_game AS (
      SELECT current_the_floor_duel_sequence, (
        SELECT MIN(sequence) FROM the_floor_duels WHERE sequence > game_state.current_the_floor_duel_sequence
      ) AS next_sequence
      FROM game_state
      WHERE id = 1 AND active_segment = 'the-floor' AND the_floor_stage = 'result'
        AND EXISTS (
          SELECT 1
          FROM the_floor_duels duel
          WHERE duel.sequence = game_state.current_the_floor_duel_sequence
            AND duel.stage = 'result' AND duel.winner_team_id IS NOT NULL AND duel.settled_at IS NOT NULL
        )
      FOR UPDATE
    ),
    advanced AS (
      UPDATE game_state game
      SET
        current_the_floor_duel_sequence = COALESCE(current_game.next_sequence, current_game.current_the_floor_duel_sequence),
        the_floor_stage = CASE WHEN current_game.next_sequence IS NULL THEN 'results' ELSE 'setup' END
      FROM current_game
      WHERE game.id = 1
      RETURNING game.the_floor_stage
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Seeds SPORT's fixed schedule and opens administrator team-pair and player-number setup. */
export async function startSportSegment() {
  await ensureDatabase();
  const sql = database();
  await Promise.all(SPORT_CHALLENGES.map((challenge) => sql`
    INSERT INTO sport_challenges (sequence, pair_slot)
    VALUES (${challenge.sequence}, ${challenge.pairSlot})
    ON CONFLICT (sequence) DO NOTHING
  `));
  await Promise.all(Array.from({ length: SPORT_BONUS_ROUND_COUNT }, (_, sequence) => sql`
    INSERT INTO sport_bonus_rounds (sequence)
    VALUES (${sequence})
    ON CONFLICT (sequence) DO NOTHING
  `));
  const rows = (await sql`
    WITH opened AS (
      UPDATE game_state
      SET active_segment = 'sport', sport_stage = 'setup', current_sport_challenge_sequence = 0, current_sport_bonus_sequence = 0
      WHERE id = 1 AND status = 'started' AND sport_stage = 'intro'
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'sport_started', jsonb_build_object('challenges', ${SPORT_CHALLENGE_COUNT}::INTEGER, 'bonusRounds', ${SPORT_BONUS_ROUND_COUNT}::INTEGER)
    FROM opened
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

/** Saves all four team positions and a complete, consecutive player ranking per team while setup remains editable. */
export async function configureSportSetup(input: {
  pairA: { teamAId: TeamId; teamBId: TeamId };
  pairB: { teamAId: TeamId; teamBId: TeamId };
  assignments: { teamId: TeamId; playerId: number; number: number }[];
}) {
  await ensureDatabase();
  const sql = database();
  const assignments = JSON.stringify(input.assignments);
  const validRows = (await sql`
    WITH current_game AS (
      SELECT id
      FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'sport' AND sport_stage = 'setup'
      FOR UPDATE
    ),
    submitted AS (
      SELECT (entry ->> 'teamId')::VARCHAR(16) AS team_id,
        (entry ->> 'playerId')::BIGINT AS player_id,
        (entry ->> 'number')::SMALLINT AS player_number
      FROM jsonb_array_elements(${assignments}::JSONB) AS entry
    ),
    matching AS (
      SELECT submitted.*
      FROM submitted
      JOIN players player ON player.id = submitted.player_id AND player.team_id = submitted.team_id AND player.active = TRUE
    ),
    team_rosters AS (
      SELECT team.team_id, COUNT(player.id)::INTEGER AS active_player_count
      FROM (VALUES ('royal'::VARCHAR(16)), ('ruby'::VARCHAR(16)), ('emerald'::VARCHAR(16)), ('onyx'::VARCHAR(16))) AS team(team_id)
      LEFT JOIN players player ON player.team_id = team.team_id AND player.active = TRUE
      GROUP BY team.team_id
    ),
    team_rankings AS (
      SELECT roster.team_id, roster.active_player_count,
        COUNT(matching.player_id)::INTEGER AS assignment_count,
        COUNT(DISTINCT matching.player_id)::INTEGER AS distinct_player_count,
        COUNT(DISTINCT matching.player_number)::INTEGER AS distinct_rank_count,
        COALESCE(MIN(matching.player_number), 0)::INTEGER AS first_rank,
        COALESCE(MAX(matching.player_number), 0)::INTEGER AS last_rank
      FROM team_rosters roster
      LEFT JOIN matching ON matching.team_id = roster.team_id
      GROUP BY roster.team_id, roster.active_player_count
    )
    SELECT EXISTS (SELECT 1 FROM current_game)
      AND (
        (SELECT COUNT(*) FROM submitted) = 0
        OR (
          (SELECT COUNT(*) FROM submitted) = (SELECT COUNT(*) FROM matching)
          AND NOT EXISTS (
            SELECT 1
            FROM team_rankings
            WHERE active_player_count = 0
              OR assignment_count <> active_player_count
              OR distinct_player_count <> active_player_count
              OR distinct_rank_count <> active_player_count
              OR first_rank <> 1
              OR last_rank <> active_player_count
          )
        )
      ) AS completed
  `) as CompletionRow[];
  if (!(validRows[0]?.completed === true || validRows[0]?.completed === "t")) return false;

  await sql`
    INSERT INTO sport_pairings (slot, team_a_id, team_b_id)
    VALUES ('a', ${input.pairA.teamAId}, ${input.pairA.teamBId}), ('b', ${input.pairB.teamAId}, ${input.pairB.teamBId})
    ON CONFLICT (slot) DO UPDATE SET team_a_id = EXCLUDED.team_a_id, team_b_id = EXCLUDED.team_b_id
  `;
  if (input.assignments.length === 0) {
    await sql`
      INSERT INTO admin_actions (action, details)
      VALUES ('sport_pairs_saved', jsonb_build_object('pairA', jsonb_build_array(${input.pairA.teamAId}::TEXT, ${input.pairA.teamBId}::TEXT), 'pairB', jsonb_build_array(${input.pairB.teamAId}::TEXT, ${input.pairB.teamBId}::TEXT)))
    `;
    return true;
  }
  await sql`DELETE FROM sport_player_numbers`;
  await sql`
    INSERT INTO sport_player_numbers (team_id, player_id, player_number)
    SELECT (entry ->> 'teamId')::VARCHAR(16), (entry ->> 'playerId')::BIGINT, (entry ->> 'number')::SMALLINT
    FROM jsonb_array_elements(${assignments}::JSONB) AS entry
  `;
  await sql`
    INSERT INTO admin_actions (action, details)
    VALUES ('sport_setup_saved', jsonb_build_object('pairA', jsonb_build_array(${input.pairA.teamAId}::TEXT, ${input.pairA.teamBId}::TEXT), 'pairB', jsonb_build_array(${input.pairB.teamAId}::TEXT, ${input.pairB.teamBId}::TEXT)))
  `;
  return true;
}

/** Verifies all administrator-selected pairs and complete player rankings, then opens betting for challenge one. */
export async function startSportChallenges() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_game AS (
      SELECT id
      FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'sport' AND sport_stage = 'setup'
      FOR UPDATE
    ),
    valid_pairings AS (
      SELECT COUNT(*) = 4
        AND COUNT(DISTINCT team_id) = 4 AS completed
      FROM (
        SELECT team_a_id AS team_id FROM sport_pairings
        UNION ALL
        SELECT team_b_id AS team_id FROM sport_pairings
      ) teams
    ),
    valid_numbers AS (
      WITH team_rosters AS (
        SELECT team.team_id, COUNT(player.id)::INTEGER AS active_player_count
        FROM (VALUES ('royal'::VARCHAR(16)), ('ruby'::VARCHAR(16)), ('emerald'::VARCHAR(16)), ('onyx'::VARCHAR(16))) AS team(team_id)
        LEFT JOIN players player ON player.team_id = team.team_id AND player.active = TRUE
        GROUP BY team.team_id
      ),
      team_rankings AS (
        SELECT roster.team_id, roster.active_player_count,
          COUNT(number.player_id)::INTEGER AS assignment_count,
          COUNT(player.id)::INTEGER AS matching_assignment_count,
          COUNT(DISTINCT number.player_id)::INTEGER AS distinct_player_count,
          COUNT(DISTINCT number.player_number)::INTEGER AS distinct_rank_count,
          COALESCE(MIN(number.player_number), 0)::INTEGER AS first_rank,
          COALESCE(MAX(number.player_number), 0)::INTEGER AS last_rank
        FROM team_rosters roster
        LEFT JOIN sport_player_numbers number ON number.team_id = roster.team_id
        LEFT JOIN players player ON player.id = number.player_id AND player.active = TRUE AND player.team_id = roster.team_id
        GROUP BY roster.team_id, roster.active_player_count
      )
      SELECT NOT EXISTS (
        SELECT 1
        FROM team_rankings
        WHERE active_player_count < 5
          OR assignment_count <> active_player_count
          OR matching_assignment_count <> active_player_count
          OR distinct_player_count <> active_player_count
          OR distinct_rank_count <> active_player_count
          OR first_rank <> 1
          OR last_rank <> active_player_count
      ) AS completed
    ),
    opened_challenge AS (
      UPDATE sport_challenges challenge
      SET stage = 'betting', bet_stake = ${STANDARD_DUEL_BET_STAKE}::NUMERIC
      WHERE challenge.sequence = 0 AND challenge.stage = 'pending'
        AND EXISTS (SELECT 1 FROM current_game)
        AND (SELECT completed FROM valid_pairings)
        AND (SELECT completed FROM valid_numbers)
      RETURNING challenge.id
    ),
    opened_game AS (
      UPDATE game_state
      SET sport_stage = 'betting', current_sport_challenge_sequence = 0
      WHERE id = 1 AND EXISTS (SELECT 1 FROM opened_challenge)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM opened_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Debits a fixed SPORT stake from a player outside the two teams competing in the current challenge. */
export async function placeSportBet(input: { bettorId: number; targetTeamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await runWithGameLock(sql, sql`
    WITH current_challenge AS (
      SELECT challenge.id, pairing.team_a_id, pairing.team_b_id, challenge.bet_stake
      FROM sport_challenges challenge
      JOIN sport_pairings pairing ON pairing.slot = challenge.pair_slot
      JOIN game_state game ON game.current_sport_challenge_sequence = challenge.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'sport'
        AND game.sport_stage = 'betting' AND challenge.stage = 'betting'
      FOR UPDATE
    ),
    eligible AS (
      SELECT current_challenge.id, current_challenge.bet_stake
      FROM current_challenge
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= current_challenge.bet_stake
      WHERE bettor.team_id NOT IN (current_challenge.team_a_id, current_challenge.team_b_id)
        AND ${input.targetTeamId} IN (current_challenge.team_a_id, current_challenge.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM sport_bets prior WHERE prior.challenge_id = current_challenge.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players SET tokens = tokens - eligible.bet_stake
      FROM eligible
      WHERE players.id = ${input.bettorId}
      RETURNING players.id
    ),
    inserted AS (
      INSERT INTO sport_bets (challenge_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, eligible.bet_stake
      FROM eligible WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `)) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Closes optional betting and opens the real-world challenge. */
export async function startSportChallenge() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_challenge AS (
      SELECT challenge.id
      FROM sport_challenges challenge
      JOIN sport_pairings pairing ON pairing.slot = challenge.pair_slot
      JOIN game_state game ON game.current_sport_challenge_sequence = challenge.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'sport'
        AND game.sport_stage = 'betting' AND challenge.stage = 'betting'
      FOR UPDATE
    ),
    started_challenge AS (
      UPDATE sport_challenges challenge
      SET stage = 'live', started_at = NOW()
      FROM current_challenge
      WHERE challenge.id = current_challenge.id
      RETURNING challenge.id
    ),
    started_game AS (
      UPDATE game_state SET sport_stage = 'live'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM started_challenge)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM started_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

export function finishSportChallenge(winnerTeamId: TeamId, eventId: number) {
  return settleStandardTeamDuel("sport", winnerTeamId, eventId);
}

/** Opens the next SPORT challenge or the first bonus setup after a settled main challenge. */
async function moveToNextSportChallenge() {
  const sql = database();
  const rows = (await sql`
    WITH current_challenge AS (
      SELECT challenge.sequence
      FROM sport_challenges challenge
      JOIN game_state game ON game.current_sport_challenge_sequence = challenge.sequence
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'result'
        AND challenge.stage = 'result' AND challenge.winner_team_id IS NOT NULL AND challenge.settled_at IS NOT NULL
      FOR UPDATE OF challenge
    ),
    opened_challenge AS (
      UPDATE sport_challenges challenge
      SET stage = 'betting', bet_stake = ${STANDARD_DUEL_BET_STAKE}::NUMERIC
      FROM current_challenge
      WHERE current_challenge.sequence < ${SPORT_CHALLENGE_COUNT - 1}
        AND challenge.sequence = current_challenge.sequence + 1 AND challenge.stage = 'pending'
      RETURNING challenge.id
    ),
    opened_bonus AS (
      UPDATE sport_bonus_rounds bonus
      SET stage = 'setup'
      FROM current_challenge
      WHERE current_challenge.sequence = ${SPORT_CHALLENGE_COUNT - 1} AND bonus.sequence = 0 AND bonus.stage = 'pending'
      RETURNING bonus.id
    ),
    advanced_game AS (
      UPDATE game_state game
      SET current_sport_challenge_sequence = CASE WHEN current_challenge.sequence < ${SPORT_CHALLENGE_COUNT - 1} THEN current_challenge.sequence + 1 ELSE current_challenge.sequence END,
        current_sport_bonus_sequence = CASE WHEN current_challenge.sequence = ${SPORT_CHALLENGE_COUNT - 1} THEN 0 ELSE game.current_sport_bonus_sequence END,
        sport_stage = CASE WHEN current_challenge.sequence < ${SPORT_CHALLENGE_COUNT - 1} THEN 'betting' ELSE 'bonus-setup' END
      FROM current_challenge
      WHERE game.id = 1 AND (EXISTS (SELECT 1 FROM opened_challenge) OR EXISTS (SELECT 1 FROM opened_bonus))
      RETURNING game.id
    )
    SELECT EXISTS (SELECT 1 FROM advanced_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Saves one limb requirement for each team before the active SPORT bonus round starts. */
export async function configureSportBonusRequirements(input: { requirements: { teamId: TeamId; limbs: number }[] }) {
  await ensureDatabase();
  const sql = database();
  const requirements = JSON.stringify(input.requirements);
  const rows = (await sql`
    WITH current_bonus AS (
      SELECT bonus.id
      FROM sport_bonus_rounds bonus
      JOIN game_state game ON game.current_sport_bonus_sequence = bonus.sequence
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'bonus-setup' AND bonus.stage = 'setup'
      FOR UPDATE OF bonus
    ),
    submitted AS (
      SELECT (entry ->> 'teamId')::VARCHAR(16) AS team_id, (entry ->> 'limbs')::SMALLINT AS limbs
      FROM jsonb_array_elements(${requirements}::JSONB) AS entry
    ),
    valid AS (
      SELECT EXISTS (SELECT 1 FROM current_bonus)
        AND (SELECT COUNT(*) FROM submitted) = 4
        AND (SELECT COUNT(DISTINCT team_id) FROM submitted) = 4 AS completed
    ),
    inserted AS (
      INSERT INTO sport_bonus_requirements (bonus_round_id, team_id, limbs)
      SELECT current_bonus.id, submitted.team_id, submitted.limbs
      FROM current_bonus CROSS JOIN submitted
      WHERE (SELECT completed FROM valid)
      ON CONFLICT (bonus_round_id, team_id) DO UPDATE SET limbs = EXCLUDED.limbs
      RETURNING bonus_round_id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Starts a fully configured SPORT bonus round; bonus rounds never open betting. */
export async function startSportBonusRound() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_bonus AS (
      SELECT bonus.id
      FROM sport_bonus_rounds bonus
      JOIN game_state game ON game.current_sport_bonus_sequence = bonus.sequence
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'bonus-setup' AND bonus.stage = 'setup'
      FOR UPDATE OF bonus
    ),
    started_bonus AS (
      UPDATE sport_bonus_rounds bonus
      SET stage = 'live', started_at = NOW()
      WHERE bonus.id IN (SELECT id FROM current_bonus)
        AND (SELECT COUNT(*) FROM sport_bonus_requirements requirement WHERE requirement.bonus_round_id = bonus.id) = 4
      RETURNING bonus.id
    ),
    started_game AS (
      UPDATE game_state SET sport_stage = 'bonus-live'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM started_bonus)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM started_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Confirms a SPORT bonus winner and adds administrator-selected points exactly once. */
export async function finishSportBonusRound(input: { eventId: number; winnerTeamId: TeamId; points: number }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH changed AS (
      UPDATE sport_bonus_rounds bonus
      SET stage = 'result', winner_team_id = ${input.winnerTeamId}, points = ${input.points}, ended_at = NOW()
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'bonus-live'
        AND game.current_sport_bonus_sequence = bonus.sequence AND bonus.id = ${input.eventId}
        AND bonus.stage = 'live' AND bonus.winner_team_id IS NULL
      RETURNING bonus.id
    ),
    updated_score AS (
      UPDATE solenizant_team_scores score
      SET points = points + ${input.points}
      WHERE score.team_id = ${input.winnerTeamId} AND EXISTS (SELECT 1 FROM changed)
      RETURNING score.team_id
    ),
    advanced_game AS (
      UPDATE game_state SET sport_stage = 'bonus-result'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM updated_score)
      RETURNING id
    ),
    recorded_action AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'sport_bonus_scored', jsonb_build_object('winnerTeamId', ${input.winnerTeamId}::TEXT, 'points', ${input.points}::INTEGER)
      FROM advanced_game
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Opens the next SPORT bonus setup or marks the segment complete. */
async function moveToNextSportBonusRound() {
  const sql = database();
  const rows = (await sql`
    WITH current_bonus AS (
      SELECT bonus.sequence
      FROM sport_bonus_rounds bonus
      JOIN game_state game ON game.current_sport_bonus_sequence = bonus.sequence
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'bonus-result'
        AND bonus.stage = 'result' AND bonus.winner_team_id IS NOT NULL AND bonus.points IS NOT NULL
      FOR UPDATE OF bonus
    ),
    opened_bonus AS (
      UPDATE sport_bonus_rounds bonus
      SET stage = 'setup'
      FROM current_bonus
      WHERE current_bonus.sequence < ${SPORT_BONUS_ROUND_COUNT - 1}
        AND bonus.sequence = current_bonus.sequence + 1 AND bonus.stage = 'pending'
      RETURNING bonus.id
    ),
    advanced_game AS (
      UPDATE game_state game
      SET current_sport_bonus_sequence = CASE WHEN current_bonus.sequence < ${SPORT_BONUS_ROUND_COUNT - 1} THEN current_bonus.sequence + 1 ELSE current_bonus.sequence END,
        sport_stage = CASE WHEN current_bonus.sequence < ${SPORT_BONUS_ROUND_COUNT - 1} THEN 'bonus-setup' ELSE 'results' END
      FROM current_bonus
      WHERE game.id = 1 AND (current_bonus.sequence = ${SPORT_BONUS_ROUND_COUNT - 1} OR EXISTS (SELECT 1 FROM opened_bonus))
      RETURNING game.id
    )
    SELECT EXISTS (SELECT 1 FROM advanced_game) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Advances exactly one completed SPORT main challenge or bonus round. */
export async function moveToNextSportStage() {
  await ensureDatabase();
  return await moveToNextSportChallenge() || await moveToNextSportBonusRound();
}

/** Clears SPORT progress and its main-challenge points, preserving paid transfers and awarded bonus points. */
export async function restartSportSegment() {
  await ensureDatabase();
  const sql = database();
  await runWithGameLock(sql, sql`
    WITH pending_refunds AS (
      SELECT bettor_id, SUM(stake) AS refund
      FROM sport_bets
      WHERE result = 'pending'
      GROUP BY bettor_id
    ),
    refunded_players AS (
      UPDATE players player
      SET tokens = player.tokens + pending_refunds.refund
      FROM pending_refunds
      WHERE player.id = pending_refunds.bettor_id
      RETURNING player.id
    ),
    cleared_transfers AS (
      DELETE FROM sport_chip_transfers
      RETURNING id
    ),
    cleared_bets AS (
      DELETE FROM sport_bets
      RETURNING id
    ),
    cleared_requirements AS (
      DELETE FROM sport_bonus_requirements
      RETURNING bonus_round_id
    ),
    cleared_bonuses AS (
      DELETE FROM sport_bonus_rounds
      RETURNING id
    ),
    cleared_challenges AS (
      DELETE FROM sport_challenges
      RETURNING id
    ),
    cleared_numbers AS (
      DELETE FROM sport_player_numbers
      RETURNING player_id
    ),
    cleared_pairings AS (
      DELETE FROM sport_pairings
      RETURNING slot
    ),
    reset_state AS (
      UPDATE game_state
      SET active_segment = 'sport', sport_stage = 'intro', current_sport_challenge_sequence = 0, current_sport_bonus_sequence = 0
      WHERE id = 1
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'sport_restart', jsonb_build_object('refundedPlayers', (SELECT COUNT(*) FROM refunded_players), 'clearedChallenges', (SELECT COUNT(*) FROM cleared_challenges))
    FROM reset_state
  `);
}

/** Confirms the four fixed teams by moving the segment into its ready stage. */
export async function confirmMelodiaTeams() {
  await ensureDatabase();
  const sql = database();
  const rows = await sql`
    UPDATE game_state SET melodia_stage = 'ready'
    WHERE id = 1 AND status = 'started' AND active_segment = 'melodia' AND melodia_stage = 'intro'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Starts the first song and seeds all five slots in the same write. */
export async function startMelodiaSegment() {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH started AS (
      UPDATE game_state SET melodia_stage = 'song', current_melodia_song_sequence = 0
      WHERE id = 1 AND status = 'started' AND active_segment = 'melodia' AND melodia_stage = 'ready'
      RETURNING id
    ),
    songs AS (
      INSERT INTO melodia_songs (sequence, stage, started_at)
      SELECT sequence, CASE WHEN sequence = 0 THEN 'live' ELSE 'pending' END,
        CASE WHEN sequence = 0 THEN NOW() END
      FROM started CROSS JOIN generate_series(0, ${MELODIA_SONG_COUNT - 1}::INTEGER) AS sequence
      ON CONFLICT (sequence) DO UPDATE SET stage = EXCLUDED.stage, started_at = EXCLUDED.started_at
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'melodia_started', jsonb_build_object('songs', COUNT(*)) FROM songs
    HAVING COUNT(*) > 0
    RETURNING id
  `);
  return rows.length > 0;
}

export async function openMelodiaScoring(songId: number) {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH opened_song AS (
      UPDATE melodia_songs song SET stage = 'scoring'
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'song'
        AND song.id = ${songId} AND song.sequence = game.current_melodia_song_sequence AND song.stage = 'live'
      RETURNING song.id
    )
    UPDATE game_state SET melodia_stage = 'scoring'
    WHERE id = 1 AND EXISTS (SELECT 1 FROM opened_song)
    RETURNING id
  `);
  return rows.length > 0;
}

/** Records one song and its points exactly once. */
export async function scoreMelodiaSong(input: {
  songId: number;
  winnerTeamId: TeamId;
  artistCorrect: boolean;
  titleCorrect: boolean;
}) {
  await ensureDatabase();
  const sql = database();
  const artistPoints = input.artistCorrect ? 1 : 0;
  const titlePoints = input.titleCorrect ? 1 : 0;
  const rows = await runWithGameLock(sql, sql`
    WITH changed AS (
      UPDATE melodia_songs song
      SET stage = 'result', winning_team_id = ${input.winnerTeamId}, artist_points = ${artistPoints}, title_points = ${titlePoints}, scored_at = NOW()
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'scoring'
        AND song.id = ${input.songId} AND song.sequence = game.current_melodia_song_sequence AND song.stage = 'scoring'
      RETURNING song.id, song.sequence
    ),
    awards AS (
      SELECT ${input.winnerTeamId}::TEXT AS team_id, ${artistPoints + titlePoints}::INTEGER AS points FROM changed
    ),
    segment_score AS (
      UPDATE melodia_team_scores score SET points = score.points + awards.points
      FROM awards WHERE score.team_id = awards.team_id
    ),
    global_score AS (
      UPDATE solenizant_team_scores score SET points = score.points + awards.points
      FROM awards WHERE score.team_id = awards.team_id
    )
    UPDATE game_state
    SET melodia_stage = CASE WHEN changed.sequence = ${MELODIA_SONG_COUNT - 1} THEN 'results' ELSE 'result' END
    FROM changed WHERE game_state.id = 1
    RETURNING game_state.id
  `);
  return rows.length > 0;
}

export async function moveToNextMelodiaSong(songId: number) {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH current_song AS (
      SELECT song.sequence FROM melodia_songs song JOIN game_state game ON song.sequence = game.current_melodia_song_sequence
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'result'
        AND song.id = ${songId} AND song.stage = 'result' AND song.sequence < ${MELODIA_SONG_COUNT - 1}
    ),
    opened_song AS (
      UPDATE melodia_songs song SET stage = 'live', started_at = NOW()
      FROM current_song WHERE song.sequence = current_song.sequence + 1 AND song.stage = 'pending'
      RETURNING song.sequence
    )
    UPDATE game_state SET current_melodia_song_sequence = opened_song.sequence, melodia_stage = 'song'
    FROM opened_song WHERE id = 1
    RETURNING id
  `);
  return rows.length > 0;
}

export async function confirmMelodiaWinner(input: { songId: number; winnerTeamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH leaders AS (
      SELECT team_id FROM melodia_team_scores WHERE points = (SELECT MAX(points) FROM melodia_team_scores)
    )
    UPDATE game_state game SET melodia_winning_team_id = ${input.winnerTeamId}
    FROM melodia_songs song
    WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'results'
      AND game.melodia_settled_at IS NULL AND song.sequence = game.current_melodia_song_sequence AND song.id = ${input.songId}
      AND song.stage = 'result' AND song.sequence = ${MELODIA_SONG_COUNT - 1}
      AND EXISTS (SELECT 1 FROM leaders WHERE team_id = ${input.winnerTeamId})
    RETURNING game.id
  `);
  return rows.length > 0;
}

type MelodiaSettlementStatus = "settled" | "not_ready" | "roster_changed" | "empty_roster" | "insufficient" | "balance_limit";

export async function settleMelodiaReward(input: { songId: number; winnerTeamId: TeamId; rosterIds: number[] }) {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH leaders AS (
      SELECT team_id FROM melodia_team_scores WHERE points = (SELECT MAX(points) FROM melodia_team_scores)
    ),
    candidate AS (
      SELECT game.id, song.id AS final_song_id, ${input.winnerTeamId}::VARCHAR(16) AS winner
      FROM game_state game JOIN melodia_songs song ON song.sequence = game.current_melodia_song_sequence
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'results'
        AND game.melodia_settled_at IS NULL AND song.id = ${input.songId} AND song.sequence = ${MELODIA_SONG_COUNT - 1}
        AND song.stage = 'result'
        AND EXISTS (SELECT 1 FROM leaders WHERE team_id = ${input.winnerTeamId})
        AND game.melodia_winning_team_id = ${input.winnerTeamId}
    ),
    roster AS (
      SELECT player.id, player.tokens, player.team_id = candidate.winner AS is_winner
      FROM candidate CROSS JOIN players player
      WHERE player.active = TRUE ORDER BY player.id FOR UPDATE OF player
    ),
    counts AS (
      SELECT COUNT(*) FILTER (WHERE is_winner) AS winners, COUNT(*) FILTER (WHERE NOT is_winner) AS losers
      FROM roster
    ),
    budget AS (
      SELECT losers * ${MELODIA_LOSER_CONTRIBUTION}::NUMERIC * 10000 AS units, winners
      FROM counts WHERE losers > 0 AND winners > 0
    ),
    ranked AS (
      SELECT roster.*, ROW_NUMBER() OVER (PARTITION BY is_winner ORDER BY id) AS position FROM roster
    ),
    allocation AS (
      SELECT ranked.id, ranked.tokens,
        CASE WHEN is_winner THEN (DIV(units, winners) + CASE WHEN position <= MOD(units, winners) THEN 1 ELSE 0 END) * 0.0001
          ELSE -${MELODIA_LOSER_CONTRIBUTION}::NUMERIC
        END AS delta
      FROM ranked CROSS JOIN budget
    ),
    outcome AS (
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_ready'
        WHEN NOT EXISTS (SELECT 1 FROM budget) THEN 'empty_roster'
        WHEN ARRAY(SELECT id FROM roster ORDER BY id) <> ARRAY(
          SELECT value::BIGINT FROM jsonb_array_elements_text(${JSON.stringify(input.rosterIds)}::JSONB)
        ) THEN 'roster_changed'
        WHEN EXISTS (SELECT 1 FROM allocation WHERE tokens + delta < 0) THEN 'insufficient'
        WHEN EXISTS (SELECT 1 FROM allocation WHERE tokens + delta > 9999999999999999.9999) THEN 'balance_limit'
        WHEN (SELECT COALESCE(SUM(delta), 0) FROM allocation) <> 0 THEN 'not_ready'
        ELSE 'settled'
      END AS status
    ),
    changed AS (
      UPDATE players player SET tokens = allocation.tokens + allocation.delta
      FROM allocation CROSS JOIN outcome
      WHERE player.id = allocation.id AND outcome.status = 'settled'
      RETURNING player.id, allocation.tokens AS previous_tokens, player.tokens AS new_tokens, allocation.delta
    ),
    recorded AS (
      INSERT INTO melodia_chip_transfers (final_song_id, player_id, previous_tokens, new_tokens, delta)
      SELECT candidate.final_song_id, changed.id, changed.previous_tokens, changed.new_tokens, changed.delta
      FROM changed CROSS JOIN candidate
    ),
    marked AS (
      UPDATE game_state game SET melodia_winning_team_id = candidate.winner, melodia_settled_at = NOW(), melodia_pool_rule = TRUE
      FROM candidate CROSS JOIN outcome WHERE game.id = candidate.id AND outcome.status = 'settled'
      RETURNING candidate.winner, candidate.final_song_id
    ),
    audited AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'melodia_reward_settled', jsonb_build_object('winner', winner, 'finalSongId', final_song_id)
      FROM marked
    )
    SELECT status FROM outcome
  `) as { status: MelodiaSettlementStatus }[];
  return rows[0].status;
}

export async function completeMelodiaSegment(songId: number) {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH completed AS (
      UPDATE game_state game SET melodia_stage = 'completed'
      FROM melodia_songs song
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'results'
        AND game.melodia_settled_at IS NOT NULL AND song.sequence = game.current_melodia_song_sequence AND song.id = ${songId}
      RETURNING game.id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'melodia_completed', '{}'::JSONB FROM completed
    RETURNING id
  `);
  return rows.length > 0;
}

/** Clears segment progress and its score contribution. Completed chip transfers remain in the ledger. */
export async function restartMelodiaSegment() {
  await ensureDatabase();
  const sql = database();
  const rows = await runWithGameLock(sql, sql`
    WITH reset_state AS (
      UPDATE game_state SET melodia_stage = 'intro', current_melodia_song_sequence = 0, melodia_winning_team_id = NULL, melodia_settled_at = NULL, melodia_pool_rule = FALSE
      WHERE id = 1 AND active_segment = 'melodia' AND status = 'started' RETURNING id
    ),
    reversed_global AS (
      UPDATE solenizant_team_scores score SET points = GREATEST(0, score.points - segment.points)
      FROM melodia_team_scores segment WHERE score.team_id = segment.team_id AND EXISTS (SELECT 1 FROM reset_state)
    ),
    cleared_songs AS (
      DELETE FROM melodia_songs WHERE EXISTS (SELECT 1 FROM reset_state) RETURNING id
    ),
    reset_scores AS (
      UPDATE melodia_team_scores SET points = 0 WHERE EXISTS (SELECT 1 FROM reset_state)
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'melodia_restart', jsonb_build_object('clearedSongs', (SELECT COUNT(*) FROM cleared_songs)) FROM reset_state
    RETURNING id
  `);
  return rows.length > 0;
}

/** Seeds four durable team-duel slots and opens selection for the first Pojedynki duel. */
export async function startPojedynkiSegment() {
  await ensureDatabase();
  const sql = database();
  await Promise.all(Array.from({ length: POJEDYNKI_DUEL_COUNT }, (_, sequence) => sql`
    INSERT INTO pojedynki_duels (sequence) VALUES (${sequence}) ON CONFLICT (sequence) DO NOTHING
  `));
  const rows = (await sql`
    WITH opened AS (
      UPDATE game_state
      SET active_segment = 'pojedynki', pojedynki_stage = 'setup', current_pojedynki_duel_sequence = 0
      WHERE id = 1 AND status = 'started' AND pojedynki_stage = 'intro'
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'pojedynki_started', jsonb_build_object('duels', ${POJEDYNKI_DUEL_COUNT}::INTEGER) FROM opened
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

/** Configures the two competing teams for one pending Pojedynki slot and opens its market. */
export async function configurePojedynkiDuel(input: { teamAId: TeamId; teamBId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_game AS (
      SELECT current_pojedynki_duel_sequence
      FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'pojedynki' AND pojedynki_stage = 'setup'
      FOR UPDATE
    ),
    configured AS (
      UPDATE pojedynki_duels duel
      SET team_a_id = ${input.teamAId}, team_b_id = ${input.teamBId}, stage = 'betting', bet_stake = ${STANDARD_DUEL_BET_STAKE}::NUMERIC,
        started_at = NULL, ended_at = NULL, winner_team_id = NULL, settled_at = NULL
      FROM current_game
      WHERE duel.sequence = current_game.current_pojedynki_duel_sequence AND duel.stage = 'pending'
        AND ${input.teamAId} <> ${input.teamBId}
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state SET pojedynki_stage = 'betting'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM configured)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Debits the stake stored for the open duel only once from a player outside the selected teams. */
export async function placePojedynkiBet(input: { bettorId: number; targetTeamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await runWithGameLock(sql, sql`
    WITH current_duel AS (
      SELECT duel.id, duel.team_a_id, duel.team_b_id, duel.bet_stake
      FROM pojedynki_duels duel
      JOIN game_state game ON game.current_pojedynki_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'pojedynki'
        AND game.pojedynki_stage = 'betting' AND duel.stage = 'betting'
      FOR UPDATE
    ),
    eligible AS (
      SELECT current_duel.id, current_duel.bet_stake
      FROM current_duel
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= current_duel.bet_stake
      WHERE bettor.team_id NOT IN (current_duel.team_a_id, current_duel.team_b_id)
        AND ${input.targetTeamId} IN (current_duel.team_a_id, current_duel.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM pojedynki_bets prior WHERE prior.duel_id = current_duel.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players SET tokens = tokens - eligible.bet_stake
      FROM eligible
      WHERE players.id = ${input.bettorId}
      RETURNING players.id
    ),
    inserted AS (
      INSERT INTO pojedynki_bets (duel_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, eligible.bet_stake
      FROM eligible WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `)) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Closes optional betting and opens the real-world duel. */
export async function startPojedynkiDuel() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_duel AS (
      SELECT duel.id, duel.team_a_id, duel.team_b_id
      FROM pojedynki_duels duel
      JOIN game_state game ON game.current_pojedynki_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'pojedynki'
        AND game.pojedynki_stage = 'betting' AND duel.stage = 'betting'
      FOR UPDATE
    ),
    started AS (
      UPDATE pojedynki_duels duel
      SET stage = 'live', started_at = NOW()
      FROM current_duel
      WHERE duel.id = current_duel.id
        AND current_duel.team_a_id IS NOT NULL AND current_duel.team_b_id IS NOT NULL
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state SET pojedynki_stage = 'live'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM started)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

export function finishPojedynkiDuel(winnerTeamId: TeamId, eventId: number) {
  return settleStandardTeamDuel("pojedynki", winnerTeamId, eventId);
}

/** Opens only the next pending Pojedynki slot, or marks the segment's fourth result as final. */
export async function moveToNextPojedynkiDuel() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_game AS (
      SELECT current_pojedynki_duel_sequence
      FROM game_state
      WHERE id = 1 AND active_segment = 'pojedynki' AND pojedynki_stage = 'result'
        AND EXISTS (
          SELECT 1 FROM pojedynki_duels duel
          WHERE duel.sequence = game_state.current_pojedynki_duel_sequence
            AND duel.stage = 'result' AND duel.winner_team_id IS NOT NULL AND duel.settled_at IS NOT NULL
        )
      FOR UPDATE
    ),
    advanced AS (
      UPDATE game_state game
      SET current_pojedynki_duel_sequence = CASE WHEN current_game.current_pojedynki_duel_sequence < ${POJEDYNKI_DUEL_COUNT - 1} THEN current_game.current_pojedynki_duel_sequence + 1 ELSE current_game.current_pojedynki_duel_sequence END,
        pojedynki_stage = CASE WHEN current_game.current_pojedynki_duel_sequence < ${POJEDYNKI_DUEL_COUNT - 1} THEN 'setup' ELSE 'results' END
      FROM current_game WHERE game.id = 1 RETURNING game.id
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Records completion acknowledgement only after all four durable Pojedynki results are settled. */
export async function completePojedynkiSegment() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH completed AS (
      SELECT id FROM game_state WHERE id = 1 AND active_segment = 'pojedynki' AND pojedynki_stage = 'results'
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'pojedynki_completed', '{}'::JSONB FROM completed
    RETURNING id
  `) as { id: number }[];
  return rows.length > 0;
}

/** Clears only Pojedynki data and refunds unsettled stakes without affecting other segments. */
export async function restartPojedynkiSegment() {
  await ensureDatabase();
  const sql = database();
  await runWithGameLock(sql, sql`
    WITH pending_refunds AS (
      SELECT bettor_id, SUM(stake) AS refund FROM pojedynki_bets WHERE result = 'pending' GROUP BY bettor_id
    ),
    refunded_players AS (
      UPDATE players player SET tokens = tokens + pending_refunds.refund
      FROM pending_refunds WHERE player.id = pending_refunds.bettor_id RETURNING player.id
    ),
    cleared_bets AS (DELETE FROM pojedynki_bets RETURNING id),
    cleared_duels AS (DELETE FROM pojedynki_duels RETURNING id),
    reset_state AS (
      UPDATE game_state SET active_segment = 'pojedynki', pojedynki_stage = 'intro', current_pojedynki_duel_sequence = 0
      WHERE id = 1 RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'pojedynki_restart', jsonb_build_object('clearedDuels', (SELECT COUNT(*) FROM cleared_duels), 'refundedPlayers', (SELECT COUNT(*) FROM refunded_players)) FROM reset_state
  `);
}
