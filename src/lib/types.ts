export type TeamId = "royal" | "ruby" | "emerald" | "onyx";

export type GameStatus = "waiting" | "started";

export interface Player {
  id: number;
  nickname: string;
  teamId: TeamId;
  tokens: number;
  createdAt: string;
}

export interface GameState {
  id: number;
  status: GameStatus;
  startedAt: string | null;
}

export interface GameSnapshot {
  game: GameState;
  players: Player[];
}

export type Session =
  | { role: "player"; playerId: number; expiresAt: number }
  | { role: "admin"; expiresAt: number };

export interface TeamMeta {
  id: TeamId;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  softColor: string;
}
