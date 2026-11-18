export type TeamId = "royal" | "ruby" | "emerald" | "onyx";

export type GameStatus = "waiting" | "started";
export type SegmentId = "solenizant" | "the-floor" | "sport" | "melodia" | "pojedynki";
export type SolenizantStage = "intro" | "question" | "scoring" | "results";
export type TheFloorStage = "intro" | "setup" | "betting" | "live" | "result" | "results";
export type TheFloorDuelStage = "pending" | "betting" | "live" | "result";
export type SportStage = "intro" | "setup" | "betting" | "live" | "result" | "bonus-setup" | "bonus-live" | "bonus-result" | "results";
export type SportPairSlot = "a" | "b";
export type SportChallengeStage = "pending" | "betting" | "live" | "result";
export type SportBonusStage = "pending" | "setup" | "live" | "result";
export type MelodiaStage = "intro" | "betting" | "song" | "scoring" | "result" | "results";
export type MelodiaSongStage = "pending" | "live" | "scoring" | "result";
export type PojedynkiStage = "intro" | "setup" | "betting" | "live" | "result" | "results";
export type PojedynkiDuelStage = "pending" | "betting" | "live" | "result";

export interface Player {
  id: number;
  nickname: string;
  teamId: TeamId;
  tokens: string;
  createdAt: string;
}

export interface GameState {
  id: number;
  status: GameStatus;
  startedAt: string | null;
  activeSegment: SegmentId;
  solenizantStage: SolenizantStage;
  currentQuestionIndex: number;
  theFloorStage: TheFloorStage;
  currentTheFloorDuelSequence: number;
  sportStage: SportStage;
  currentSportChallengeSequence: number;
  currentSportBonusSequence: number;
  melodiaStage: MelodiaStage;
  currentMelodiaSongSequence: number;
  melodiaWinningTeamId: TeamId | null;
  melodiaSettledAt: string | null;
  pojedynkiStage: PojedynkiStage;
  currentPojedynkiDuelSequence: number;
}

export interface TeamScore {
  teamId: TeamId;
  points: number;
}

export interface TheFloorDuel {
  id: number;
  sequence: number;
  categoryId: string;
  stage: TheFloorDuelStage;
  teamAId: TeamId | null;
  teamBId: TeamId | null;
  activeTeamId: TeamId | null;
  itemIndex: number;
  teamATimeSeconds: number;
  teamBTimeSeconds: number;
  turnStartedAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  winnerTeamId: TeamId | null;
  betCount: number;
  viewerBetTargetTeamId: TeamId | null;
  viewerBetResult: "pending" | "won" | "lost" | "refunded" | null;
  viewerBetPayout: string | null;
}

export interface TheFloorState {
  stage: TheFloorStage;
  currentDuel: TheFloorDuel | null;
  duels: TheFloorDuel[];
}

export interface SportPairing {
  slot: SportPairSlot;
  teamAId: TeamId;
  teamBId: TeamId;
}

export interface SportPlayerNumber {
  teamId: TeamId;
  playerId: number;
  number: number;
}

export interface SportChallenge {
  id: number;
  sequence: number;
  pairSlot: SportPairSlot;
  stage: SportChallengeStage;
  winnerTeamId: TeamId | null;
  betCount: number;
  viewerBetTargetTeamId: TeamId | null;
  viewerBetResult: "pending" | "won" | "lost" | null;
  viewerBetPayout: string | null;
}

export interface SportBonusRequirement {
  teamId: TeamId;
  limbs: number;
}

export interface SportBonusRound {
  id: number;
  sequence: number;
  stage: SportBonusStage;
  requirements: SportBonusRequirement[];
  winnerTeamId: TeamId | null;
  points: number | null;
}

export interface SportState {
  stage: SportStage;
  currentChallenge: SportChallenge | null;
  challenges: SportChallenge[];
  currentBonus: SportBonusRound | null;
  bonuses: SportBonusRound[];
  pairings: SportPairing[];
  playerNumbers: SportPlayerNumber[];
}

export interface MelodiaBid {
  teamId: TeamId;
  declaredLines: number;
}

export interface MelodiaSong {
  id: number;
  sequence: number;
  stage: MelodiaSongStage;
  winningTeamId: TeamId | null;
  artistPoints: number | null;
  titlePoints: number | null;
  singingPoints: number | null;
  singingMistake: boolean;
  biddingEnabled: boolean;
  bidWinnerTeamId: TeamId | null;
  bidCompleted: boolean | null;
  bids: MelodiaBid[];
}

export interface MelodiaTeamScore {
  teamId: TeamId;
  points: number;
}

export interface MelodiaState {
  stage: MelodiaStage;
  currentSong: MelodiaSong | null;
  songs: MelodiaSong[];
  teamScores: MelodiaTeamScore[];
  betCount: number;
  viewerBetTargetTeamId: TeamId | null;
  viewerBetStake: string | null;
  viewerBetResult: "pending" | "won" | "lost" | "refunded" | null;
  viewerBetPayout: string | null;
  leadingTeamIds: TeamId[];
  settledAt: string | null;
}

export interface PojedynkiDuel {
  id: number;
  sequence: number;
  stage: PojedynkiDuelStage;
  teamAId: TeamId | null;
  teamBId: TeamId | null;
  winnerTeamId: TeamId | null;
  betCount: number;
  viewerBetTargetTeamId: TeamId | null;
  viewerBetResult: "pending" | "won" | "lost" | "refunded" | null;
  viewerBetPayout: string | null;
}

export interface PojedynkiState {
  stage: PojedynkiStage;
  currentDuel: PojedynkiDuel | null;
  duels: PojedynkiDuel[];
}

export interface GameSnapshot {
  game: GameState;
  players: Player[];
  teamScores: TeamScore[];
  totalTokens: string;
  theFloor: TheFloorState;
  sport: SportState;
  melodia: MelodiaState;
  pojedynki: PojedynkiState;
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
