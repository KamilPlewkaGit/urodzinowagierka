export type TeamId = "royal" | "ruby" | "emerald" | "onyx";

export type GameStatus = "waiting" | "started";
export type SegmentId = "solenizant" | "the-floor" | "sport" | "melodia" | "pojedynki" | "familiada" | "gold-challenge" | "alkoholicy" | "finale";
export type SolenizantStage = "intro" | "question" | "scoring" | "results";
export type TheFloorStage = "intro" | "setup" | "betting" | "live" | "result" | "results";
export type TheFloorDuelStage = "pending" | "betting" | "live" | "result";
export type SportStage = "intro" | "setup" | "betting" | "live" | "result" | "bonus-setup" | "bonus-live" | "bonus-result" | "results";
export type SportPairSlot = "a" | "b";
export type SportChallengeStage = "pending" | "betting" | "live" | "result";
export type SportBonusStage = "pending" | "setup" | "live" | "result";
export type MelodiaStage = "intro" | "ready" | "song" | "scoring" | "result" | "results" | "completed";
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
  settledAt: string | null;
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

export type TheFloorPrompt =
  | { kind: "image"; url: string }
  | { kind: "text"; text: string }
  | { kind: "error"; message: string };

export interface TheFloorContent {
  name: string;
  instructions: string;
  itemCount: number;
  categoryError: string | null;
  prompt: TheFloorPrompt | null;
  adminAnswer?: string | null;
}

export interface TheFloorPreloadManifest {
  version: string;
  urls: string[];
  labels: Record<string, string>;
  issues: string[];
}

export interface TheFloorPreloadStatus {
  players: number;
  readyPlayers: number;
  devices: number;
  readyDevices: number;
  failedAssets: string[];
}

export interface TheFloorState {
  serverTime: number;
  content: TheFloorContent | null;
  catalogErrors?: string[];
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

export interface MelodiaSong {
  id: number;
  sequence: number;
  stage: MelodiaSongStage;
  winningTeamId: TeamId | null;
  artistPoints: number | null;
  titlePoints: number | null;

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
  leadingTeamIds: TeamId[];
  winningTeamId: TeamId | null;
  settledAt: string | null;
  reward: { pool: string; min: string; max: string } | null;
  transferPreview?: { playerId: number; delta: string }[];
  insufficientPlayers?: number[];
  viewerDelta: string | null;
  completedLegacy: boolean;
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

export type FamiliadaStage = "setup" | "match-ready" | "betting" | "betting-closed" | "question-ready" | "question" | "buzzer" | "first" | "second" | "no-answer" | "play" | "steal" | "round-result" | "match-confirmation" | "match-result" | "completed";

export type FamiliadaAnswer = { position: number; text: string; points: number };
export type FamiliadaRepresentative = { id: number; nickname: string; teamId: TeamId };

export interface FamiliadaSnapshot {
  revision: string;
  stage: FamiliadaStage;
  matchIndex: number;
  matches: {
    teams: [TeamId, TeamId];
    scores: [number, number];
    winner: TeamId | null;
    settledAt: string | null;
    betCount: number;
    viewerBet: { target: TeamId; result: "pending" | "won" | "lost"; payout: string } | null;
  }[];
  questionIndex: number;
  round: {
    question: string;
    answers: { position: number; revealed: FamiliadaAnswer | null }[];
    adminAnswers?: FamiliadaAnswer[];
    representatives: FamiliadaRepresentative[];
    buzzerWinner: number | null;
    controllingTeam: TeamId | null;
    strikes: number;
    stealFailed: boolean;
    pool: number;
    winner: TeamId | null;
  } | null;
}

export type FinaleStage = "intro" | "ready" | "question" | "answer" | "winner" | "wheel" | "summary" | "completed";
export type FinaleDirection = "more" | "less";
export type FinaleUnit = "percent" | "people" | "years";

export interface FinaleSnapshot {
  revision: string;
  stage: FinaleStage;
  ranking: TeamScore[];
  eligibleOrders: [TeamId, TeamId][];
  finalists: [TeamScore, TeamScore] | null;
  needsConfirmation: boolean;
  question: {
    number: number;
    text: string;
    unit: FinaleUnit;
    estimate: number | null;
    direction: FinaleDirection | null;
    answer: string | null;
    adminAnswer?: string;
    winner: TeamId | null;
    points: number | null;
  } | null;
  winners: (TeamId | null)[];
  roundPoints: (number | null)[];
  overallLeaders: TeamId[];
  overallWinner: TeamId | null;
}

export type AlkoholicyStage = "intro" | "order" | "charades-ready" | "charades-betting" | "charades-play" | "charades-review" | "charades-results" | "duel-setup" | "duel-betting" | "duel-live" | "duel-result" | "results" | "completed";
export type AlkoholicyBetResult = "pending" | "won" | "lost" | "refunded";

export interface AlkoholicyMarket {
  counts: Record<AlkoholicyBetResult, number>;
  viewerBet: { target: TeamId; result: AlkoholicyBetResult; payout: string } | null;
}

export interface AlkoholicyProgress {
  stage: AlkoholicyStage;
  order: TeamId[];
  performance: number;
  scores: Partial<Record<TeamId, number>>;
  duelTeams: [TeamId, TeamId] | null;
  duelIndex: 0 | 1;
  duelHistory: { teams: [TeamId, TeamId]; winner: TeamId }[];
  legacyDuelAward?: { winner: TeamId; points: number };
}

export interface AlkoholicySnapshot extends AlkoholicyProgress {
  revision: string;
  charadesLeaders: TeamId[];
  charadesMarket: AlkoholicyMarket;
  duelMarket: AlkoholicyMarket;
  duelMarkets: [AlkoholicyMarket, AlkoholicyMarket];
}

export type GoldStage = "intro" | "nominations" | "contributions" | "live" | "result"
  | "six-intro" | "six-voting" | "six-closed" | "six-confirmed" | "six-result" | "completed";
export type GoldRepresentative = { id: number; nickname: string; teamId: TeamId };
export type GoldReward = {
  pool: string;
  contributors?: number;
  shares: { playerId: number; nickname: string; amount: string }[];
};
export type GoldNumberResult = {
  number: number;
  correct: number;
  incorrect: number;
  pool: string;
  void: boolean;
  transfers: { playerId: number; nickname: string; correct: boolean; delta: string }[];
};

export interface GoldProgress {
  stage: GoldStage;
  teams: TeamId[];
  representatives: GoldRepresentative[];
  winner: GoldRepresentative | null;
  reward: GoldReward | null;
  firstEscrowId?: string;
  sixRoundId?: string;
  sixPendingNumber?: number;
  sixResult?: GoldNumberResult;
}

export interface GoldSnapshot extends Omit<GoldProgress, "firstEscrowId" | "sixRoundId" | "sixPendingNumber"> {
  revision: string;
  viewerNominationId: number | null;
  viewerNumber: number | null;
  adminNominations?: Record<number, number>;
  adminContributions?: { players: number; pool: string; shortfalls: string[] };
  adminPreviews?: Partial<Record<TeamId, GoldReward>>;
  adminNumbers?: { votedIds: number[]; counts?: number[]; reserved: string; pendingNumber?: number };
  firstContributors?: { id: number; nickname: string }[];
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
  familiada: FamiliadaSnapshot;
  alkoholicy: AlkoholicySnapshot;
  goldChallenge: GoldSnapshot;
  finale: FinaleSnapshot;
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
