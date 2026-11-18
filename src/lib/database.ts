import "server-only";

import { randomBytes } from "node:crypto";

import { defaults, neon, type NeonQueryPromise } from "@neondatabase/serverless";

import { STARTING_TOKENS } from "@/lib/constants";
import { advanceFamiliada, FamiliadaConflict, getFamiliadaSnapshot, type FamiliadaBetSummary, type StoredFamiliada } from "@/lib/familiada";
import type { FamiliadaAction } from "@/lib/validation";
import { THE_FLOOR_BET_STAKE, THE_FLOOR_CATEGORY_IDS, THE_FLOOR_DUEL_SECONDS, THE_FLOOR_PASS_PENALTY_SECONDS } from "@/lib/floor";
import { getTheFloorCatalogStatus, getTheFloorContent, getTheFloorItemCounts } from "@/lib/floor-content";
import { SOLENIZANT_LAST_QUESTION_INDEX } from "@/lib/solenizant";
import { SPORT_BET_STAKE, SPORT_BONUS_ROUND_COUNT, SPORT_CHALLENGE_COUNT, SPORT_CORRECT_BET_PROFIT, SPORT_CHALLENGES } from "@/lib/sport";
import { MELODIA_REWARD, MELODIA_SONG_COUNT } from "@/lib/melodia";
import { POJEDYNKI_BET_STAKE, POJEDYNKI_DUEL_COUNT } from "@/lib/pojedynki";
import type { GameSnapshot, GameState, MelodiaBid, MelodiaSong, MelodiaSongStage, MelodiaStage, MelodiaState, MelodiaTeamScore, Player, PojedynkiDuel, PojedynkiDuelStage, PojedynkiStage, PojedynkiState, SegmentId, Session, SportBonusRound, SportBonusStage, SportChallenge, SportChallengeStage, SportPairing, SportPairSlot, SportPlayerNumber, SportStage, SportState, TeamId, TeamScore, TheFloorDuel, TheFloorDuelStage, TheFloorState, TheFloorStage } from "@/lib/types";

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
  pojedynki_stage: PojedynkiStage;
  current_pojedynki_duel_sequence: number;
};

type TeamScoreRow = {
  team_id: TeamId;
  points: number;
};

type SessionRow = {
  token: string;
  role: "player" | "admin";
  player_id: number | null;
  expires_at: string | Date;
};

type NewSession =
  | { role: "player"; playerId: number; expiresAt: Date }
  | { role: "admin"; expiresAt: Date };

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
  id: number;
  sequence: number;
  category_id: string;
  stage: TheFloorDuelStage;
  team_a_id: TeamId | null;
  team_b_id: TeamId | null;
  active_team_id: TeamId | null;
  item_index: number;
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
type SportChallengeRow = { id: number; sequence: number; pair_slot: SportPairSlot; stage: SportChallengeStage; winner_team_id: TeamId | null };
type SportBetCountRow = { challenge_id: number; bet_count: number };
type SportViewerBetRow = { challenge_id: number; target_team_id: TeamId | null; result: "pending" | "won" | "lost" | null; payout: string | number };
type SportBonusRow = { id: number; sequence: number; stage: SportBonusStage; winner_team_id: TeamId | null; points: number | null };
type SportBonusRequirementRow = { bonus_round_id: number; team_id: TeamId; limbs: number };
type MelodiaSongRow = { id: number; sequence: number; stage: MelodiaSongStage; winning_team_id: TeamId | null; artist_points: number | null; title_points: number | null; singing_points: number | null; singing_mistake: boolean; bidding_enabled: boolean; bid_winner_team_id: TeamId | null; bid_completed: boolean | null };
type MelodiaBidRow = { song_id: number; team_id: TeamId; declared_lines: number };
type MelodiaTeamScoreRow = { team_id: TeamId; points: number };
type SnapshotQuery<Row> = NeonQueryPromise<false, false, Row[]>;
type FamiliadaRow = { familiada_state: StoredFamiliada | null; familiada_revision: string };
type SnapshotRows<Queries extends readonly PromiseLike<unknown>[]> = { [Index in keyof Queries]: Awaited<Queries[Index]> };

type MelodiaSettlementRow = { debit_min: string | null; debit_max: string | null; viewer_delta: string | null };
type PojedynkiDuelRow = { id: number; sequence: number; stage: PojedynkiDuelStage; team_a_id: TeamId | null; team_b_id: TeamId | null; winner_team_id: TeamId | null };
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
  if (state.stage !== "betting" || !match.teams.includes(target)) return [];
  return runWithGameLock(sql, sql`
    WITH debited AS (
      UPDATE players player
      SET tokens = player.tokens - ${SPORT_BET_STAKE}::NUMERIC
      FROM game_state game
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'familiada'
        AND game.familiada_revision = ${revision}::UUID
        AND player.id = ${bettorId} AND player.active
        AND player.team_id NOT IN (${match.teams[0]}, ${match.teams[1]})
        AND player.tokens >= ${SPORT_BET_STAKE}::NUMERIC
        AND NOT EXISTS (
          SELECT 1 FROM familiada_bets WHERE match_index = ${state.matchIndex} AND bettor_id = player.id
        )
      RETURNING player.id
    )
    INSERT INTO familiada_bets (match_index, bettor_id, target_team_id, stake)
    SELECT ${state.matchIndex}::SMALLINT, id, ${target}, ${SPORT_BET_STAKE}::NUMERIC FROM debited
    RETURNING bettor_id
  `);
}

/** One transaction confirms the scoreboard and applies the SPORT-style chip settlement. */
async function settleFamiliadaMatch(sql: ReturnType<typeof database>, revision: string, state: StoredFamiliada, winner: TeamId) {
  const match = state.matches[state.matchIndex];
  const loser = match.teams[0] === winner ? match.teams[1] : match.teams[0];
  return runWithGameLock(sql, sql`
    WITH candidate AS (
      SELECT id FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'familiada'
        AND familiada_revision = ${revision}::UUID
        AND familiada_state ->> 'stage' = 'match-confirmation'
    ),
    bets AS (
      SELECT bet.* FROM familiada_bets bet CROSS JOIN candidate
      WHERE bet.match_index = ${state.matchIndex} AND bet.result = 'pending'
    ),
    totals AS (
      SELECT COALESCE(SUM(stake) FILTER (WHERE target_team_id <> ${winner}), 0) AS lost_stakes,
        COUNT(*) FILTER (WHERE target_team_id = ${winner}) * ${SPORT_CORRECT_BET_PROFIT}::NUMERIC AS profit_due
      FROM bets
    ),
    locked_players AS (
      SELECT player.id, player.team_id, player.tokens, player.created_at, player.active
      FROM players player CROSS JOIN candidate
      WHERE (player.active AND player.team_id IN (${winner}, ${loser}))
        OR player.id IN (SELECT bettor_id FROM bets WHERE target_team_id = ${winner})
      ORDER BY player.id
      FOR UPDATE OF player
    ),
    ranked_members AS (
      SELECT id, team_id, tokens,
        ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY created_at, id) AS member_rank,
        COUNT(*) OVER (PARTITION BY team_id) AS team_size
      FROM locked_players
      WHERE active AND team_id IN (${winner}, ${loser})
    ),
    split_amounts AS (
      SELECT member.*, CASE WHEN team_id = ${winner} THEN lost_stakes ELSE -profit_due END AS team_delta
      FROM ranked_members member CROSS JOIN totals
    ),
    member_deltas AS (
      SELECT id, tokens,
        TRUNC(team_delta / team_size, 4) +
        CASE WHEN member_rank = 1 THEN team_delta - TRUNC(team_delta / team_size, 4) * team_size ELSE 0 END AS delta
      FROM split_amounts
    ),
    approved AS (
      SELECT candidate.id FROM candidate CROSS JOIN totals
      WHERE (lost_stakes = 0 OR EXISTS (SELECT 1 FROM ranked_members WHERE team_id = ${winner}))
        AND (profit_due = 0 OR EXISTS (SELECT 1 FROM ranked_members WHERE team_id = ${loser}))
        AND NOT EXISTS (SELECT 1 FROM member_deltas WHERE tokens + delta < 0)
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
    allocations AS (
      SELECT id, SUM(delta) AS delta FROM (
        SELECT id, delta FROM member_deltas
        UNION ALL
        SELECT bettor_id, payout FROM settled_bets
      ) transfers GROUP BY id
    ),
    updated_players AS (
      UPDATE players player SET tokens = player.tokens + allocations.delta
      FROM allocations CROSS JOIN approved
      WHERE player.id = allocations.id AND allocations.delta <> 0
      RETURNING player.id, allocations.delta
    ),
    saved AS (
      UPDATE game_state game SET familiada_state = ${JSON.stringify(state)}::JSONB, familiada_revision = gen_random_uuid()
      FROM approved WHERE game.id = approved.id
      RETURNING game.id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'familiada_match_settled', jsonb_build_object(
      'matchIndex', ${state.matchIndex}::INTEGER, 'winnerTeamId', ${winner}::TEXT,
      'transfers', COALESCE((SELECT jsonb_object_agg(id, delta) FROM updated_players), '{}'::JSONB)
    ) FROM saved
    RETURNING id
  `);
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
    if (!(await settleFamiliadaMatch(sql, revision, next, command.teamId)).length) {
      throw new FamiliadaConflict("Nie udało się rozliczyć meczu. Sprawdź aktualny etap, aktywnych członków drużyn i salda przegranych.");
    }
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
    sequence: row.sequence,
    pairSlot: row.pair_slot,
    stage: row.stage,
    winnerTeamId: row.winner_team_id,
    betCount,
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

function toMelodiaSong(row: MelodiaSongRow, bids: MelodiaBidRow[]): MelodiaSong {
  return {
    id: row.id,
    sequence: row.sequence,
    stage: row.stage,
    winningTeamId: row.winning_team_id,
    artistPoints: row.artist_points,
    titlePoints: row.title_points,
    singingPoints: row.singing_points,
    singingMistake: row.singing_mistake,
    biddingEnabled: row.bidding_enabled,
    bidWinnerTeamId: row.bid_winner_team_id,
    bidCompleted: row.bid_completed,
    bids: bids.filter((bid) => bid.song_id === row.id).map((bid): MelodiaBid => ({ teamId: bid.team_id, declaredLines: bid.declared_lines })),
  };
}

function toPojedynkiDuel(row: PojedynkiDuelRow, betCount: number, viewerBet: PojedynkiViewerBetRow | undefined): PojedynkiDuel {
  return {
    id: row.id,
    sequence: row.sequence,
    stage: row.stage,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    winnerTeamId: row.winner_team_id,
    betCount,
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
    viewerBetTargetTeamId: viewerBet?.target_team_id ?? null,
    viewerBetResult: viewerBet?.result ?? null,
    viewerBetPayout: viewerBet ? normalizeChipAmount(viewerBet.payout) : null,
  };
}

function toSession(row: SessionRow): Session | null {
  const expiresAt = Math.floor(new Date(row.expires_at).getTime() / 1000);
  if (!Number.isFinite(expiresAt)) return null;
  if (row.role === "admin" && row.player_id === null) return { role: "admin", expiresAt };
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
          active_segment VARCHAR(16) NOT NULL DEFAULT 'solenizant' CONSTRAINT game_state_active_segment_check CHECK (active_segment IN ('solenizant', 'the-floor', 'sport', 'melodia', 'pojedynki', 'familiada')),
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
      await sql`
        DO $$
        BEGIN
          ALTER TABLE game_state DROP CONSTRAINT IF EXISTS game_state_active_segment_check;
          ALTER TABLE game_state ADD CONSTRAINT game_state_active_segment_check CHECK (active_segment IN ('solenizant', 'the-floor', 'sport', 'melodia', 'pojedynki', 'familiada'));
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_solenizant_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_solenizant_stage_check CHECK (solenizant_stage IN ('intro', 'question', 'scoring', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_solenizant_question_index_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_solenizant_question_index_check CHECK (current_question_index BETWEEN 0 AND 5);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_the_floor_stage_check') THEN
            ALTER TABLE game_state ADD CONSTRAINT game_state_the_floor_stage_check CHECK (the_floor_stage IN ('intro', 'setup', 'betting', 'live', 'result', 'results'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_state_the_floor_sequence_check') THEN
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
          role VARCHAR(16) NOT NULL CHECK (role IN ('player', 'admin')),
          player_id BIGINT REFERENCES players(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK (
            (role = 'player' AND player_id IS NOT NULL)
            OR (role = 'admin' AND player_id IS NULL)
          )
        )
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
      await sql`
        CREATE TABLE IF NOT EXISTS the_floor_bets (
          id BIGSERIAL PRIMARY KEY,
          duel_id BIGINT NOT NULL REFERENCES the_floor_duels(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_player_id BIGINT REFERENCES players(id),
          target_team_id VARCHAR(16) CONSTRAINT the_floor_bets_target_team_check CHECK (target_team_id IS NULL OR target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'refunded')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (duel_id, bettor_id)
        )
      `;
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
      await sql`
        CREATE TABLE IF NOT EXISTS sport_bets (
          id BIGSERIAL PRIMARY KEY,
          challenge_id BIGINT NOT NULL REFERENCES sport_challenges(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (challenge_id, bettor_id)
        )
      `;
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
          singing_points SMALLINT CHECK (singing_points IS NULL OR singing_points BETWEEN 0 AND 5),
          singing_mistake BOOLEAN NOT NULL DEFAULT FALSE,
          bidding_enabled BOOLEAN NOT NULL DEFAULT FALSE,
          bid_winner_team_id VARCHAR(16) CHECK (bid_winner_team_id IS NULL OR bid_winner_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          bid_completed BOOLEAN,
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
        CREATE TABLE IF NOT EXISTS melodia_bids (
          song_id BIGINT NOT NULL REFERENCES melodia_songs(id) ON DELETE CASCADE,
          team_id VARCHAR(16) NOT NULL CHECK (team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          declared_lines SMALLINT NOT NULL CHECK (declared_lines BETWEEN 0 AND 5),
          PRIMARY KEY (song_id, team_id)
        )
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
      await sql`
        CREATE TABLE IF NOT EXISTS pojedynki_bets (
          id BIGSERIAL PRIMARY KEY,
          duel_id BIGINT NOT NULL REFERENCES pojedynki_duels(id) ON DELETE CASCADE,
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (stake > 0),
          result VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost', 'refunded')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          settled_at TIMESTAMPTZ,
          UNIQUE (duel_id, bettor_id)
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS pojedynki_bets_duel_index ON pojedynki_bets (duel_id)`;
      await sql`
        CREATE TABLE IF NOT EXISTS familiada_bets (
          match_index SMALLINT NOT NULL CHECK (match_index BETWEEN 0 AND 1),
          bettor_id BIGINT NOT NULL REFERENCES players(id),
          target_team_id VARCHAR(16) NOT NULL CHECK (target_team_id IN ('royal', 'ruby', 'emerald', 'onyx')),
          stake NUMERIC(20,4) NOT NULL DEFAULT 2 CHECK (stake = 2),
          result VARCHAR(8) NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'won', 'lost')),
          payout NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (payout >= 0),
          settled_at TIMESTAMPTZ,
          PRIMARY KEY (match_index, bettor_id)
        )
      `;
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
  const reads = [
    sql`
      SELECT id, status, started_at, active_segment, solenizant_stage, current_question_index, the_floor_stage, current_the_floor_duel_sequence,
        sport_stage, current_sport_challenge_sequence, current_sport_bonus_sequence,
        melodia_stage, current_melodia_song_sequence, melodia_winning_team_id, melodia_settled_at,
        pojedynki_stage, current_pojedynki_duel_sequence, familiada_state, familiada_revision
      FROM game_state
      WHERE id = 1
    ` as SnapshotQuery<GameRow & FamiliadaRow>,
    sql`
      SELECT id, nickname, team_id, tokens, created_at
      FROM players
      WHERE active = TRUE
      ORDER BY created_at ASC
    ` as SnapshotQuery<PlayerRow>,
    sql`
      SELECT team_id, points
      FROM solenizant_team_scores
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
        stage, team_a_id, team_b_id, active_team_id, item_index,
        team_a_time_seconds, team_b_time_seconds, turn_started_at, started_at, ended_at, winner_team_id
      FROM the_floor_duels
      ORDER BY sequence
    ` as SnapshotQuery<TheFloorDuelRow>,
    sql`SELECT duel_id, COUNT(*)::INTEGER AS bet_count FROM the_floor_bets GROUP BY duel_id` as SnapshotQuery<TheFloorBetCountRow>,
    sql`SELECT duel_id, target_team_id, result, payout FROM the_floor_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<TheFloorViewerBetRow>,
    sql`SELECT slot, team_a_id, team_b_id FROM sport_pairings ORDER BY slot` as SnapshotQuery<SportPairingRow>,
    sql`SELECT team_id, player_id, player_number FROM sport_player_numbers ORDER BY team_id, player_number` as SnapshotQuery<SportPlayerNumberRow>,
    sql`SELECT id, sequence, pair_slot, stage, winner_team_id FROM sport_challenges ORDER BY sequence` as SnapshotQuery<SportChallengeRow>,
    sql`SELECT challenge_id, COUNT(*)::INTEGER AS bet_count FROM sport_bets GROUP BY challenge_id` as SnapshotQuery<SportBetCountRow>,
    sql`SELECT challenge_id, target_team_id, result, payout FROM sport_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<SportViewerBetRow>,
    sql`SELECT id, sequence, stage, winner_team_id, points FROM sport_bonus_rounds ORDER BY sequence` as SnapshotQuery<SportBonusRow>,
    sql`SELECT bonus_round_id, team_id, limbs FROM sport_bonus_requirements ORDER BY team_id` as SnapshotQuery<SportBonusRequirementRow>,
    sql`SELECT id, sequence, stage, winning_team_id, artist_points, title_points, singing_points, singing_mistake, bidding_enabled, bid_winner_team_id, bid_completed FROM melodia_songs ORDER BY sequence` as SnapshotQuery<MelodiaSongRow>,
    sql`SELECT song_id, team_id, declared_lines FROM melodia_bids ORDER BY team_id` as SnapshotQuery<MelodiaBidRow>,
    sql`SELECT team_id, points FROM melodia_team_scores ORDER BY CASE team_id WHEN 'royal' THEN 1 WHEN 'ruby' THEN 2 WHEN 'emerald' THEN 3 WHEN 'onyx' THEN 4 END` as SnapshotQuery<MelodiaTeamScoreRow>,
    sql`
      SELECT MIN(-transfer.delta) FILTER (WHERE transfer.delta <= 0) AS debit_min,
        MAX(-transfer.delta) FILTER (WHERE transfer.delta <= 0) AS debit_max,
        MAX(transfer.delta) FILTER (WHERE transfer.player_id = ${viewerPlayerId ?? null}::BIGINT) AS viewer_delta
      FROM game_state game
      JOIN melodia_songs song ON song.sequence = game.current_melodia_song_sequence
      JOIN melodia_chip_transfers transfer ON transfer.final_song_id = song.id
      WHERE game.id = 1 AND game.melodia_settled_at IS NOT NULL
    ` as SnapshotQuery<MelodiaSettlementRow>,
    sql`SELECT id, sequence, stage, team_a_id, team_b_id, winner_team_id FROM pojedynki_duels ORDER BY sequence` as SnapshotQuery<PojedynkiDuelRow>,
    sql`SELECT duel_id, COUNT(*)::INTEGER AS bet_count FROM pojedynki_bets GROUP BY duel_id` as SnapshotQuery<PojedynkiBetCountRow>,
    sql`SELECT duel_id, target_team_id, result, payout FROM pojedynki_bets WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT` as SnapshotQuery<PojedynkiViewerBetRow>,
    sql`
      SELECT match_index, COUNT(*)::INTEGER AS bet_count,
        MAX(target_team_id) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS target,
        MAX(result) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS result,
        MAX(payout) FILTER (WHERE bettor_id = ${viewerPlayerId ?? null}::BIGINT) AS payout
      FROM familiada_bets GROUP BY match_index
    ` as SnapshotQuery<FamiliadaBetSummary>,
  ] as const;
  const [gameRows, playerRows, teamScoreRows, totalTokenRows, floorDuelRows, floorBetCountRows, viewerBetRows, sportPairingRows, sportPlayerNumberRows, sportChallengeRows, sportBetCountRows, sportViewerBetRows, sportBonusRows, sportBonusRequirementRows, melodiaSongRows, melodiaBidRows, melodiaTeamScoreRows, melodiaSettlementRows, pojedynkiDuelRows, pojedynkiBetCountRows, pojedynkiViewerBetRows, familiadaBets] = await sql.transaction([...reads], {
    isolationLevel: "RepeatableRead",
    readOnly: true,
  }) as unknown as SnapshotRows<typeof reads>;

  if (!gameRows[0]) {
    throw new Error("Game state could not be loaded.");
  }
  const game = toGameState(gameRows[0]);
  const isAdmin = options?.admin === true && viewerPlayerId === undefined;
  const floorDuels = floorDuelRows.map((row) => toTheFloorDuel(
    row,
    floorBetCountRows.find((count) => count.duel_id === row.id)?.bet_count ?? 0,
    viewerBetRows.find((bet) => bet.duel_id === row.id),
  ));
  const currentFloorDuel = floorDuels.find((duel) => duel.sequence === game.currentTheFloorDuelSequence) ?? null;
  const floorContent = game.activeSegment === "the-floor" && currentFloorDuel && game.theFloorStage !== "results"
    ? await getTheFloorContent(currentFloorDuel.categoryId, game.theFloorStage === "live" ? currentFloorDuel.itemIndex : null, isAdmin)
    : null;
  const catalogErrors = isAdmin && game.activeSegment === "the-floor" && game.theFloorStage === "intro"
    ? (await getTheFloorCatalogStatus()).errors : undefined;
  const theFloor: TheFloorState = { stage: game.theFloorStage, currentDuel: currentFloorDuel, duels: floorDuels, content: floorContent, catalogErrors };
  const sportChallenges = sportChallengeRows.map((row) => toSportChallenge(
    row,
    sportBetCountRows.find((count) => count.challenge_id === row.id)?.bet_count ?? 0,
    sportViewerBetRows.find((bet) => bet.challenge_id === row.id),
  ));
  const sportBonuses = sportBonusRows.map((row) => toSportBonusRound(row, sportBonusRequirementRows));
  const sport: SportState = {
    stage: game.sportStage,
    currentChallenge: sportChallenges.find((challenge) => challenge.sequence === game.currentSportChallengeSequence) ?? null,
    challenges: sportChallenges,
    currentBonus: sportBonuses.find((bonus) => bonus.sequence === game.currentSportBonusSequence) ?? null,
    bonuses: sportBonuses,
    pairings: sportPairingRows.map(toSportPairing),
    playerNumbers: sportPlayerNumberRows.map(toSportPlayerNumber),
  };
  const melodiaSongs = melodiaSongRows.map((row) => toMelodiaSong(row, melodiaBidRows));
  const melodiaScores: MelodiaTeamScore[] = melodiaTeamScoreRows.map((row) => ({ teamId: row.team_id, points: row.points }));
  const highestMelodiaScore = Math.max(0, ...melodiaScores.map((score) => score.points));
  const leadingTeamIds = melodiaScores.filter((score) => score.points === highestMelodiaScore).map((score) => score.teamId);
  const finalResults = game.melodiaStage === "results" || game.melodiaStage === "completed";
  const winningTeamId = finalResults ? game.melodiaWinningTeamId ?? (leadingTeamIds.length === 1 ? leadingTeamIds[0] : null) : null;
  const settled = melodiaSettlementRows[0];
  let charge = null;
  if (winningTeamId && !game.melodiaSettledAt) {
    const winners = playerRows.filter((player) => player.team_id === winningTeamId).length;
    const losers = playerRows.length - winners;
    if (winners && losers) {
      const units = BigInt(winners) * BigInt(MELODIA_REWARD * 10_000);
      const count = BigInt(losers);
      const base = units / count;
      const remainder = units % count;
      const debitAsDecimal = (amount: bigint) => `${amount / 10_000n}.${String(amount % 10_000n).padStart(4, "0")}`;
      charge = { min: debitAsDecimal(base), max: debitAsDecimal(base + (remainder > 0n ? 1n : 0n)) };
    }
  } else if (settled?.debit_min != null && settled.debit_max != null) {
    charge = { min: settled.debit_min, max: settled.debit_max };
  }
  const melodia: MelodiaState = {
    stage: game.melodiaStage,
    currentSong: melodiaSongs.find((song) => song.sequence === game.currentMelodiaSongSequence) ?? null,
    songs: melodiaSongs,
    teamScores: melodiaScores,
    leadingTeamIds: finalResults ? leadingTeamIds : [],
    winningTeamId,
    settledAt: game.melodiaSettledAt,
    charge,
    viewerDelta: settled?.viewer_delta ?? null,
    completedLegacy: game.melodiaStage === "completed" && !!game.melodiaSettledAt && charge === null,
  };
  const pojedynkiDuels = pojedynkiDuelRows.map((row) => toPojedynkiDuel(
    row,
    pojedynkiBetCountRows.find((count) => count.duel_id === row.id)?.bet_count ?? 0,
    pojedynkiViewerBetRows.find((bet) => bet.duel_id === row.id),
  ));
  const pojedynki: PojedynkiState = {
    stage: game.pojedynkiStage,
    currentDuel: pojedynkiDuels.find((duel) => duel.sequence === game.currentPojedynkiDuelSequence) ?? null,
    duels: pojedynkiDuels,
  };
  return {
    game,
    players: playerRows.map(toPlayer),
    teamScores: teamScoreRows.map(toTeamScore),
    totalTokens: normalizeChipAmount(totalTokenRows[0]?.total_tokens ?? "0"),
    theFloor,
    sport,
    melodia,
    pojedynki,
    familiada: getFamiliadaSnapshot(gameRows[0].familiada_state, gameRows[0].familiada_revision, familiadaBets, isAdmin),
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
    cleared_melodia_bids AS (
      DELETE FROM melodia_bids
      RETURNING song_id
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
        pojedynki_stage = 'intro',
        current_pojedynki_duel_sequence = 0,
        familiada_state = NULL,
        familiada_revision = gen_random_uuid()
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
        'clearedFamiliadaBets', (SELECT COUNT(*) FROM cleared_familiada_bets)
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
  await sql`
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
  `;
}

/** Assigns two teams to the currently selected category and opens betting. */
export async function configureTheFloorDuel(input: { teamAId: TeamId; teamBId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_game AS (
      SELECT current_the_floor_duel_sequence
      FROM game_state
      WHERE id = 1 AND status = 'started' AND active_segment = 'the-floor' AND the_floor_stage = 'setup'
      FOR UPDATE
    ),
    configured AS (
      UPDATE the_floor_duels AS duel
      SET team_a_id = ${input.teamAId}, team_b_id = ${input.teamBId}, stage = 'betting', item_index = 0,
        team_a_time_seconds = ${THE_FLOOR_DUEL_SECONDS}, team_b_time_seconds = ${THE_FLOOR_DUEL_SECONDS},
        active_team_id = NULL, turn_started_at = NULL, started_at = NULL, ended_at = NULL, winner_team_id = NULL, settled_at = NULL
      FROM current_game
      WHERE duel.sequence = current_game.current_the_floor_duel_sequence
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

/** Debits a fixed two-chip stake only once from a player outside the competing teams. */
export async function placeTheFloorBet(input: { bettorId: number; targetTeamId: TeamId }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_duel AS (
      SELECT duel.id, duel.team_a_id, duel.team_b_id
      FROM the_floor_duels duel
      JOIN game_state game ON game.current_the_floor_duel_sequence = duel.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'the-floor'
        AND game.the_floor_stage = 'betting' AND duel.stage = 'betting'
      FOR UPDATE
    ),
    eligible AS (
      SELECT current_duel.id
      FROM current_duel
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= ${THE_FLOOR_BET_STAKE}::NUMERIC
      WHERE bettor.team_id NOT IN (current_duel.team_a_id, current_duel.team_b_id)
        AND ${input.targetTeamId} IN (current_duel.team_a_id, current_duel.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM the_floor_bets prior WHERE prior.duel_id = current_duel.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players
      SET tokens = tokens - ${THE_FLOOR_BET_STAKE}::NUMERIC
      WHERE id = ${input.bettorId} AND EXISTS (SELECT 1 FROM eligible)
      RETURNING id
    ),
    inserted AS (
      INSERT INTO the_floor_bets (duel_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, ${THE_FLOOR_BET_STAKE}::NUMERIC
      FROM eligible
      WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Closes optional betting and starts team A's timer. */
export async function startTheFloorDuel() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH current_duel AS (
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
        AND current_duel.team_a_id IS NOT NULL AND current_duel.team_b_id IS NOT NULL
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state
      SET the_floor_stage = 'live'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM started)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM advanced) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

type TheFloorActionRow = { id: number; stage: TheFloorDuelStage };

async function settleTheFloorBets(duelId: number) {
  const sql = database();
  await sql`
    WITH candidate AS (
      SELECT id, winner_team_id
      FROM the_floor_duels
      WHERE id = ${duelId} AND stage = 'result' AND winner_team_id IS NOT NULL AND settled_at IS NULL
      FOR UPDATE
    ),
    bets AS (
      SELECT bet.*, candidate.winner_team_id
      FROM the_floor_bets bet
      JOIN candidate ON candidate.id = bet.duel_id
      WHERE bet.result = 'pending'
    ),
    summary AS (
      SELECT COALESCE(SUM(stake), 0) AS total_pot,
        COUNT(*) FILTER (WHERE target_team_id = (SELECT winner_team_id FROM candidate)) AS winning_bet_count
      FROM bets
    ),
    ranked AS (
      SELECT bets.*,
        SUM(CASE WHEN target_team_id = winner_team_id THEN 1 ELSE 0 END) OVER (ORDER BY id) AS winning_rank
      FROM bets
    ),
    calculated AS (
      SELECT ranked.id,
        CASE
          WHEN (SELECT winning_bet_count FROM summary) = 0 THEN 'refunded'
          WHEN ranked.target_team_id = ranked.winner_team_id THEN 'won'
          ELSE 'lost'
        END AS result,
        CASE
          WHEN (SELECT winning_bet_count FROM summary) = 0 THEN ranked.stake
          WHEN ranked.target_team_id <> ranked.winner_team_id THEN 0::NUMERIC
          WHEN ranked.winning_rank = 1 THEN
            TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4)
            + ((SELECT total_pot FROM summary) - TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4) * (SELECT winning_bet_count FROM summary))
          ELSE TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4)
        END AS payout
      FROM ranked
    ),
    settled_bets AS (
      UPDATE the_floor_bets bet
      SET result = calculated.result, payout = calculated.payout, settled_at = NOW()
      FROM calculated
      WHERE bet.id = calculated.id
      RETURNING bet.bettor_id, bet.payout
    ),
    paid_players AS (
      UPDATE players player
      SET tokens = player.tokens + payouts.total_payout
      FROM (
        SELECT bettor_id, SUM(payout) AS total_payout
        FROM settled_bets
        WHERE payout > 0
        GROUP BY bettor_id
      ) payouts
      WHERE player.id = payouts.bettor_id
      RETURNING player.id
    ),
    marked AS (
      UPDATE the_floor_duels
      SET settled_at = NOW()
      WHERE id IN (SELECT id FROM candidate)
      RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'the_floor_bets_settled', jsonb_build_object('duelId', id, 'paidPlayers', (SELECT COUNT(*) FROM paid_players))
    FROM marked
  `;
}

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
          ELSE (duel.item_index + 1) % GREATEST(1, (${itemCounts}::JSONB ->> duel.category_id)::INTEGER)
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

/** Confirms one competing team as winner after its duel has finished, then settles bets once. */
export async function endTheFloorDuel(winnerTeamId: TeamId) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH changed AS (
      UPDATE the_floor_duels duel
      SET winner_team_id = ${winnerTeamId}
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'the-floor'
        AND game.the_floor_stage = 'result' AND game.current_the_floor_duel_sequence = duel.sequence
        AND duel.stage = 'result'
        AND (duel.winner_team_id IS NULL OR (duel.winner_team_id = ${winnerTeamId} AND duel.settled_at IS NULL))
        AND ${winnerTeamId} IN (duel.team_a_id, duel.team_b_id)
      RETURNING duel.id, duel.stage
    ),
    advanced_game AS (
      UPDATE game_state SET the_floor_stage = 'result'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed)
      RETURNING id
    )
    SELECT changed.id, changed.stage FROM changed WHERE EXISTS (SELECT 1 FROM advanced_game)
  `) as TheFloorActionRow[];
  const result = rows[0] ?? null;
  if (result) await settleTheFloorBets(result.id);
  return result;
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
      SET stage = 'betting'
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
  const rows = (await sql`
    WITH current_challenge AS (
      SELECT challenge.id, pairing.team_a_id, pairing.team_b_id
      FROM sport_challenges challenge
      JOIN sport_pairings pairing ON pairing.slot = challenge.pair_slot
      JOIN game_state game ON game.current_sport_challenge_sequence = challenge.sequence
      WHERE game.id = 1 AND game.status = 'started' AND game.active_segment = 'sport'
        AND game.sport_stage = 'betting' AND challenge.stage = 'betting'
      FOR UPDATE
    ),
    eligible AS (
      SELECT current_challenge.id
      FROM current_challenge
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= ${SPORT_BET_STAKE}::NUMERIC
      WHERE bettor.team_id NOT IN (current_challenge.team_a_id, current_challenge.team_b_id)
        AND ${input.targetTeamId} IN (current_challenge.team_a_id, current_challenge.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM sport_bets prior WHERE prior.challenge_id = current_challenge.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players SET tokens = tokens - ${SPORT_BET_STAKE}::NUMERIC
      WHERE id = ${input.bettorId} AND EXISTS (SELECT 1 FROM eligible)
      RETURNING id
    ),
    inserted AS (
      INSERT INTO sport_bets (challenge_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, ${SPORT_BET_STAKE}::NUMERIC
      FROM eligible WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `) as CompletionRow[];
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

/** Settles SPORT bets with the documented team-funded profit and winning-team distribution. */
async function settleSportBets(challengeId: number) {
  const sql = database();
  const rows = (await sql`
    WITH candidate AS (
      SELECT challenge.id, challenge.winner_team_id,
        CASE WHEN challenge.winner_team_id = pairing.team_a_id THEN pairing.team_b_id ELSE pairing.team_a_id END AS losing_team_id
      FROM sport_challenges challenge
      JOIN sport_pairings pairing ON pairing.slot = challenge.pair_slot
      WHERE challenge.id = ${challengeId} AND challenge.stage = 'result'
        AND challenge.winner_team_id IS NOT NULL AND challenge.settled_at IS NULL
      FOR UPDATE OF challenge
    ),
    bets AS (
      SELECT bet.*, candidate.winner_team_id
      FROM sport_bets bet JOIN candidate ON candidate.id = bet.challenge_id
      WHERE bet.result = 'pending'
    ),
    summary AS (
      SELECT COALESCE(SUM(stake) FILTER (WHERE target_team_id <> (SELECT winner_team_id FROM candidate)), 0)::NUMERIC AS lost_stakes,
        COUNT(*) FILTER (WHERE target_team_id = (SELECT winner_team_id FROM candidate))::INTEGER AS correct_count
      FROM bets
    ),
    winner_members AS (
      SELECT player.id, ROW_NUMBER() OVER (ORDER BY player.created_at, player.id) AS member_rank
      FROM players player JOIN candidate ON player.team_id = candidate.winner_team_id
      WHERE player.active = TRUE
    ),
    losing_members AS (
      SELECT player.id, ROW_NUMBER() OVER (ORDER BY player.created_at, player.id) AS member_rank
      FROM players player JOIN candidate ON player.team_id = candidate.losing_team_id
      WHERE player.active = TRUE
    ),
    winner_member_count AS (SELECT COUNT(*)::INTEGER AS total FROM winner_members),
    losing_member_count AS (SELECT COUNT(*)::INTEGER AS total FROM losing_members),
    winner_rewards AS (
      SELECT member.id,
        CASE WHEN (SELECT total FROM winner_member_count) = 0 THEN 0::NUMERIC ELSE
          TRUNC((SELECT lost_stakes FROM summary) / NULLIF((SELECT total FROM winner_member_count), 0), 4)
          + CASE WHEN member.member_rank = 1 THEN (SELECT lost_stakes FROM summary) - TRUNC((SELECT lost_stakes FROM summary) / NULLIF((SELECT total FROM winner_member_count), 0), 4) * (SELECT total FROM winner_member_count) ELSE 0::NUMERIC END
        END AS amount
      FROM winner_members member
    ),
    loser_debits AS (
      SELECT member.id,
        CASE WHEN (SELECT total FROM losing_member_count) = 0 THEN 0::NUMERIC ELSE
          TRUNC(((SELECT correct_count FROM summary) * ${SPORT_CORRECT_BET_PROFIT}::NUMERIC) / NULLIF((SELECT total FROM losing_member_count), 0), 4)
          + CASE WHEN member.member_rank = 1 THEN ((SELECT correct_count FROM summary) * ${SPORT_CORRECT_BET_PROFIT}::NUMERIC) - TRUNC(((SELECT correct_count FROM summary) * ${SPORT_CORRECT_BET_PROFIT}::NUMERIC) / NULLIF((SELECT total FROM losing_member_count), 0), 4) * (SELECT total FROM losing_member_count) ELSE 0::NUMERIC END
        END AS amount
      FROM losing_members member
    ),
    sufficient AS (
      SELECT ((SELECT correct_count FROM summary) = 0 OR (SELECT total FROM losing_member_count) > 0)
        AND ((SELECT lost_stakes FROM summary) = 0 OR (SELECT total FROM winner_member_count) > 0)
        AND NOT EXISTS (
          SELECT 1 FROM loser_debits debit
          JOIN players player ON player.id = debit.id
          WHERE player.tokens < debit.amount
        ) AS completed
    ),
    settled_bets AS (
      UPDATE sport_bets bet
      SET result = CASE WHEN bet.target_team_id = candidate.winner_team_id THEN 'won' ELSE 'lost' END,
        payout = CASE WHEN bet.target_team_id = candidate.winner_team_id THEN bet.stake + ${SPORT_CORRECT_BET_PROFIT}::NUMERIC ELSE 0::NUMERIC END,
        settled_at = NOW()
      FROM candidate
      WHERE bet.challenge_id = candidate.id AND bet.result = 'pending' AND (SELECT completed FROM sufficient)
      RETURNING bet.bettor_id, bet.payout
    ),
    updated_debits AS (
      UPDATE players player
      SET tokens = player.tokens - debit.amount
      FROM loser_debits debit
      WHERE player.id = debit.id AND debit.amount > 0 AND (SELECT completed FROM sufficient)
      RETURNING player.id, debit.amount
    ),
    credit_totals AS (
      SELECT player_id, SUM(amount) AS amount
      FROM (
        SELECT bettor_id AS player_id, payout AS amount FROM settled_bets WHERE payout > 0
        UNION ALL
        SELECT id AS player_id, amount FROM winner_rewards WHERE amount > 0
      ) credits
      GROUP BY player_id
    ),
    updated_credits AS (
      UPDATE players player
      SET tokens = player.tokens + credit_totals.amount
      FROM credit_totals
      WHERE player.id = credit_totals.player_id AND (SELECT completed FROM sufficient)
      RETURNING player.id, credit_totals.amount
    ),
    recorded_transfers AS (
      INSERT INTO sport_chip_transfers (challenge_id, player_id, direction, amount, kind)
      SELECT candidate.id, bettor_id, 'credit', payout, 'prawidłowy_typ'
      FROM settled_bets CROSS JOIN candidate WHERE payout > 0
      UNION ALL
      SELECT candidate.id, debit.id, 'debit', debit.amount, 'zysk_dla_trafnych_typów'
      FROM loser_debits debit CROSS JOIN candidate WHERE debit.amount > 0 AND (SELECT completed FROM sufficient)
      UNION ALL
      SELECT candidate.id, reward.id, 'credit', reward.amount, 'stawki_błędnych_typów'
      FROM winner_rewards reward CROSS JOIN candidate WHERE reward.amount > 0 AND (SELECT completed FROM sufficient)
      RETURNING id
    ),
    marked AS (
      UPDATE sport_challenges challenge
      SET settled_at = NOW()
      WHERE challenge.id IN (SELECT id FROM candidate) AND (SELECT completed FROM sufficient)
      RETURNING challenge.id
    ),
    recorded_action AS (
      INSERT INTO admin_actions (action, details)
      SELECT 'sport_bets_settled', jsonb_build_object('challengeId', id, 'transfers', (SELECT COUNT(*) FROM recorded_transfers))
      FROM marked
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM marked) AS completed
  `) as CompletionRow[];
  return rows[0]?.completed === true || rows[0]?.completed === "t";
}

/** Stores a valid winning SPORT team after a live challenge and settles its bets once. */
export async function finishSportChallenge(winnerTeamId: TeamId) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH changed AS (
      UPDATE sport_challenges challenge
      SET stage = 'result', winner_team_id = ${winnerTeamId}, ended_at = NOW()
      FROM game_state game, sport_pairings pairing
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage IN ('live', 'result')
        AND pairing.slot = challenge.pair_slot AND game.current_sport_challenge_sequence = challenge.sequence AND challenge.stage IN ('live', 'result')
        AND ${winnerTeamId} IN (pairing.team_a_id, pairing.team_b_id)
        AND (challenge.winner_team_id IS NULL OR (challenge.winner_team_id = ${winnerTeamId} AND challenge.settled_at IS NULL))
      RETURNING challenge.id
    ),
    advanced_game AS (
      UPDATE game_state SET sport_stage = 'result'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed)
      RETURNING id
    )
    SELECT id FROM changed WHERE EXISTS (SELECT 1 FROM advanced_game)
  `) as { id: number }[];
  const changed = rows[0];
  return changed ? await settleSportBets(changed.id) : false;
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
      SET stage = 'betting'
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
export async function finishSportBonusRound(input: { winnerTeamId: TeamId; points: number }) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH changed AS (
      UPDATE sport_bonus_rounds bonus
      SET stage = 'result', winner_team_id = ${input.winnerTeamId}, points = ${input.points}, ended_at = NOW()
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'sport' AND game.sport_stage = 'bonus-live'
        AND game.current_sport_bonus_sequence = bonus.sequence AND bonus.stage = 'live' AND bonus.winner_team_id IS NULL
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

/** Clears only uncompleted SPORT setup and bets, refunding pending stakes without reversing settled results or bonus scores. */
export async function restartSportSegment() {
  await ensureDatabase();
  const sql = database();
  await sql`
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
  `;
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
  singingPoints: number;
  singingMistake: boolean;
  bidding: { enabled: boolean; bids: { teamId: TeamId; declaredLines: number }[]; winningBidderTeamId: TeamId | null; completed: boolean };
}) {
  await ensureDatabase();
  const sql = database();
  const winningBid = input.bidding.enabled ? input.bidding.bids.find((bid) => bid.teamId === input.bidding.winningBidderTeamId) : undefined;
  if (input.bidding.enabled && !winningBid) return false;

  const artistPoints = input.artistCorrect ? 1 : 0;
  const titlePoints = input.titleCorrect ? 1 : 0;
  const singingMistake = winningBid ? !input.bidding.completed : input.singingMistake;
  const singingPoints = singingMistake ? 0 : winningBid?.declaredLines ?? input.singingPoints;
  const singingTeamId = winningBid?.teamId ?? input.winnerTeamId;
  const bids = JSON.stringify(input.bidding.bids);
  const rows = await runWithGameLock(sql, sql`
    WITH changed AS (
      UPDATE melodia_songs song
      SET stage = 'result', winning_team_id = ${input.winnerTeamId}, artist_points = ${artistPoints}, title_points = ${titlePoints},
        singing_points = ${singingPoints}, singing_mistake = ${singingMistake}, bidding_enabled = ${input.bidding.enabled},
        bid_winner_team_id = ${winningBid?.teamId ?? null}, bid_completed = ${winningBid ? input.bidding.completed : null}, scored_at = NOW()
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'melodia' AND game.melodia_stage = 'scoring'
        AND song.id = ${input.songId} AND song.sequence = game.current_melodia_song_sequence AND song.stage = 'scoring'
      RETURNING song.id, song.sequence
    ),
    saved_bids AS (
      INSERT INTO melodia_bids (song_id, team_id, declared_lines)
      SELECT changed.id, (entry ->> 'teamId')::VARCHAR(16), (entry ->> 'declaredLines')::SMALLINT
      FROM changed CROSS JOIN jsonb_array_elements(${bids}::JSONB) AS entry
    ),
    awards AS (
      SELECT team_id, SUM(points)::INTEGER AS points
      FROM changed CROSS JOIN (VALUES
        (${input.winnerTeamId}::VARCHAR(16), ${artistPoints + titlePoints}::INTEGER),
        (${singingTeamId}::VARCHAR(16), ${singingPoints}::INTEGER)
      ) AS entries(team_id, points)
      WHERE points > 0
      GROUP BY team_id
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

export async function resolveMelodiaTie(input: { songId: number; winnerTeamId: TeamId }) {
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
      AND (SELECT COUNT(*) FROM leaders) > 1 AND EXISTS (SELECT 1 FROM leaders WHERE team_id = ${input.winnerTeamId})
    RETURNING game.id
  `);
  return rows.length > 0;
}

type MelodiaSettlementStatus = "settled" | "not_ready" | "empty_roster" | "insufficient" | "balance_limit";

export async function settleMelodiaReward(input: { songId: number; winnerTeamId: TeamId }) {
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
        AND ((SELECT COUNT(*) FROM leaders) = 1 OR game.melodia_winning_team_id = ${input.winnerTeamId})
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
      SELECT winners * ${MELODIA_REWARD}::NUMERIC * 10000 AS units, losers
      FROM counts WHERE losers > 0 AND winners > 0
    ),
    ranked AS (
      SELECT roster.*, ROW_NUMBER() OVER (PARTITION BY is_winner ORDER BY id) AS position FROM roster
    ),
    allocation AS (
      SELECT ranked.id, ranked.tokens,
        CASE WHEN is_winner THEN ${MELODIA_REWARD}::NUMERIC
          ELSE -(DIV(units, losers) + CASE WHEN position <= MOD(units, losers) THEN 1 ELSE 0 END) * 0.0001
        END AS delta
      FROM ranked CROSS JOIN budget
    ),
    outcome AS (
      SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM candidate) THEN 'not_ready'
        WHEN NOT EXISTS (SELECT 1 FROM budget) THEN 'empty_roster'
        WHEN EXISTS (SELECT 1 FROM allocation WHERE tokens + delta < 0) THEN 'insufficient'
        WHEN EXISTS (SELECT 1 FROM allocation WHERE tokens + delta > 9999999999999999.9999) THEN 'balance_limit'
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
      UPDATE game_state game SET melodia_winning_team_id = candidate.winner, melodia_settled_at = NOW()
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
      UPDATE game_state SET melodia_stage = 'intro', current_melodia_song_sequence = 0, melodia_winning_team_id = NULL, melodia_settled_at = NULL
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
      SET team_a_id = ${input.teamAId}, team_b_id = ${input.teamBId}, stage = 'betting',
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

/** Debits the global fixed two-chip stake only once from a player outside the selected teams. */
export async function placePojedynkiBet(input: { bettorId: number; targetTeamId: TeamId }) {
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
    eligible AS (
      SELECT current_duel.id
      FROM current_duel
      JOIN players bettor ON bettor.id = ${input.bettorId} AND bettor.active = TRUE AND bettor.tokens >= ${POJEDYNKI_BET_STAKE}::NUMERIC
      WHERE bettor.team_id NOT IN (current_duel.team_a_id, current_duel.team_b_id)
        AND ${input.targetTeamId} IN (current_duel.team_a_id, current_duel.team_b_id)
        AND NOT EXISTS (SELECT 1 FROM pojedynki_bets prior WHERE prior.duel_id = current_duel.id AND prior.bettor_id = ${input.bettorId})
    ),
    debited AS (
      UPDATE players SET tokens = tokens - ${POJEDYNKI_BET_STAKE}::NUMERIC
      WHERE id = ${input.bettorId} AND EXISTS (SELECT 1 FROM eligible)
      RETURNING id
    ),
    inserted AS (
      INSERT INTO pojedynki_bets (duel_id, bettor_id, target_team_id, stake)
      SELECT eligible.id, ${input.bettorId}, ${input.targetTeamId}, ${POJEDYNKI_BET_STAKE}::NUMERIC
      FROM eligible WHERE EXISTS (SELECT 1 FROM debited)
      RETURNING id
    )
    SELECT EXISTS (SELECT 1 FROM inserted) AS completed
  `) as CompletionRow[];
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

/** Settles one Pojedynki closed pot exactly once; no correct prediction returns every stake. */
async function settlePojedynkiBets(duelId: number) {
  const sql = database();
  await sql`
    WITH candidate AS (
      SELECT id, winner_team_id
      FROM pojedynki_duels
      WHERE id = ${duelId} AND stage = 'result' AND winner_team_id IS NOT NULL AND settled_at IS NULL
      FOR UPDATE
    ),
    bets AS (
      SELECT bet.*, candidate.winner_team_id
      FROM pojedynki_bets bet JOIN candidate ON candidate.id = bet.duel_id
      WHERE bet.result = 'pending'
    ),
    summary AS (
      SELECT COALESCE(SUM(stake), 0) AS total_pot,
        COUNT(*) FILTER (WHERE target_team_id = (SELECT winner_team_id FROM candidate)) AS winning_bet_count
      FROM bets
    ),
    ranked AS (
      SELECT bets.*, SUM(CASE WHEN target_team_id = winner_team_id THEN 1 ELSE 0 END) OVER (ORDER BY id) AS winning_rank
      FROM bets
    ),
    calculated AS (
      SELECT ranked.id,
        CASE WHEN (SELECT winning_bet_count FROM summary) = 0 THEN 'refunded'
          WHEN ranked.target_team_id = ranked.winner_team_id THEN 'won' ELSE 'lost' END AS result,
        CASE WHEN (SELECT winning_bet_count FROM summary) = 0 THEN ranked.stake
          WHEN ranked.target_team_id <> ranked.winner_team_id THEN 0::NUMERIC
          WHEN ranked.winning_rank = 1 THEN
            TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4)
              + ((SELECT total_pot FROM summary) - TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4) * (SELECT winning_bet_count FROM summary))
          ELSE TRUNC((SELECT total_pot FROM summary) / (SELECT winning_bet_count FROM summary), 4)
        END AS payout
      FROM ranked
    ),
    settled_bets AS (
      UPDATE pojedynki_bets bet SET result = calculated.result, payout = calculated.payout, settled_at = NOW()
      FROM calculated WHERE bet.id = calculated.id RETURNING bet.bettor_id, bet.payout
    ),
    paid_players AS (
      UPDATE players player SET tokens = tokens + payouts.total_payout
      FROM (
        SELECT bettor_id, SUM(payout) AS total_payout FROM settled_bets WHERE payout > 0 GROUP BY bettor_id
      ) payouts
      WHERE player.id = payouts.bettor_id RETURNING player.id
    ),
    marked AS (
      UPDATE pojedynki_duels SET settled_at = NOW()
      WHERE id IN (SELECT id FROM candidate) RETURNING id
    )
    INSERT INTO admin_actions (action, details)
    SELECT 'pojedynki_bets_settled', jsonb_build_object('duelId', id, 'paidPlayers', (SELECT COUNT(*) FROM paid_players)) FROM marked
  `;
}

/** Confirms a competing winner after the real-world duel and performs its guarded settlement. */
export async function finishPojedynkiDuel(winnerTeamId: TeamId) {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    WITH changed AS (
      UPDATE pojedynki_duels duel
      SET stage = 'result', winner_team_id = ${winnerTeamId}, ended_at = COALESCE(duel.ended_at, NOW())
      FROM game_state game
      WHERE game.id = 1 AND game.active_segment = 'pojedynki' AND game.pojedynki_stage IN ('live', 'result')
        AND game.current_pojedynki_duel_sequence = duel.sequence AND duel.stage IN ('live', 'result')
        AND (duel.winner_team_id IS NULL OR (duel.winner_team_id = ${winnerTeamId} AND duel.settled_at IS NULL))
        AND ${winnerTeamId} IN (duel.team_a_id, duel.team_b_id)
      RETURNING duel.id
    ),
    advanced AS (
      UPDATE game_state SET pojedynki_stage = 'result'
      WHERE id = 1 AND EXISTS (SELECT 1 FROM changed)
      RETURNING id
    )
    SELECT changed.id FROM changed WHERE EXISTS (SELECT 1 FROM advanced)
  `) as { id: number }[];
  const duel = rows[0];
  if (!duel) return false;
  await settlePojedynkiBets(duel.id);
  return true;
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
  await sql`
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
  `;
}
