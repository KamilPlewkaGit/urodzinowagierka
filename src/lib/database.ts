import "server-only";

import { neon } from "@neondatabase/serverless";

import { STARTING_TOKENS } from "@/lib/constants";
import type { GameSnapshot, GameState, Player, TeamId } from "@/lib/types";

type PlayerRow = {
  id: number;
  nickname: string;
  team_id: TeamId;
  tokens: number;
  created_at: string | Date;
};

type GameRow = {
  id: number;
  status: "waiting" | "started";
  started_at: string | Date | null;
};

export class NicknameTakenError extends Error {
  constructor() {
    super("That nickname is already taken.");
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

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    nickname: row.nickname,
    teamId: row.team_id,
    tokens: row.tokens,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

function toGameState(row: GameRow): GameState {
  return { id: row.id, status: row.status, startedAt: row.started_at ? toIsoTimestamp(row.started_at) : null };
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
          tokens INTEGER NOT NULL DEFAULT 100 CHECK (tokens >= 0),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS players_nickname_lower_unique ON players (LOWER(nickname))`;
      await sql`
        CREATE TABLE IF NOT EXISTS game_state (
          id SMALLINT PRIMARY KEY CHECK (id = 1),
          status VARCHAR(16) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'started')),
          started_at TIMESTAMPTZ
        )
      `;
      await sql`INSERT INTO game_state (id, status) VALUES (1, 'waiting') ON CONFLICT (id) DO NOTHING`;
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
    SELECT id, nickname, team_id, tokens, created_at FROM players WHERE id = ${playerId}
  `) as PlayerRow[];
  return rows[0] ? toPlayer(rows[0]) : null;
}

export async function getGameSnapshot(): Promise<GameSnapshot> {
  await ensureDatabase();
  const sql = database();
  const [gameRows, playerRows] = await Promise.all([
    sql`SELECT id, status, started_at FROM game_state WHERE id = 1` as unknown as Promise<GameRow[]>,
    sql`SELECT id, nickname, team_id, tokens, created_at FROM players ORDER BY created_at ASC` as unknown as Promise<PlayerRow[]>,
  ]);

  if (!gameRows[0]) {
    throw new Error("Game state could not be loaded.");
  }
  return { game: toGameState(gameRows[0]), players: playerRows.map(toPlayer) };
}

export async function startGame() {
  await ensureDatabase();
  const sql = database();
  const rows = (await sql`
    UPDATE game_state
    SET status = 'started', started_at = COALESCE(started_at, NOW())
    WHERE id = 1
    RETURNING id, status, started_at
  `) as GameRow[];
  return toGameState(rows[0]);
}
