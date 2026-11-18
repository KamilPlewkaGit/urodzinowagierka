import { z } from "zod";

import { TEAM_IDS } from "@/lib/constants";
import { SOLENIZANT_LAST_QUESTION_INDEX } from "@/lib/solenizant";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Pseudonim musi mieć co najmniej 2 znaki.")
  .max(24, "Pseudonim może mieć maksymalnie 24 znaki.")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u, "Użyj liter, cyfr, spacji, kropek, myślników lub podkreśleń.");

export const teamIdSchema = z.enum(TEAM_IDS);

export const playerRegistrationSchema = z.object({
  nickname: nicknameSchema,
  teamId: teamIdSchema,
});

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Hasło jest wymagane.").max(256, "Hasło jest za długie."),
});

export const playerIdSchema = z.number().int().positive("Nieprawidłowy gracz.");

export const chipAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,4})?$/, "Podaj nieujemną liczbę z dokładnością do 4 miejsc po przecinku.");

export const adminChipAdjustmentSchema = z.object({
  playerId: playerIdSchema,
  tokens: chipAmountSchema,
});

export const adminPlayerRemovalSchema = z.object({ playerId: playerIdSchema });

export const activeSegmentSchema = z.object({ segmentId: z.enum(["solenizant", "the-floor", "sport", "melodia", "pojedynki"]) });

export const theFloorDuelConfigurationSchema = z.object({
  teamAId: teamIdSchema,
  teamBId: teamIdSchema,
}).refine((value) => value.teamAId !== value.teamBId, "W pojedynku muszą wystąpić dwie różne drużyny.");

export const theFloorBetSchema = z.object({ targetTeamId: teamIdSchema });

export const theFloorWinnerSchema = z.object({ winnerTeamId: teamIdSchema });
export const theFloorAdvanceSchema = z.object({ action: z.enum(["correct", "pass"]) });

export const pojedynkiDuelConfigurationSchema = z.object({
  teamAId: teamIdSchema,
  teamBId: teamIdSchema,
}).refine((value) => value.teamAId !== value.teamBId, "W pojedynku muszą wystąpić dwie różne drużyny.");

export const pojedynkiBetSchema = z.object({ targetTeamId: teamIdSchema });
export const pojedynkiWinnerSchema = z.object({ winnerTeamId: teamIdSchema });

const sportPairSchema = z.object({ teamAId: teamIdSchema, teamBId: teamIdSchema }).refine((pair) => pair.teamAId !== pair.teamBId, "W parze muszą znaleźć się dwie różne drużyny.");
const sportPlayerRankSchema = z.object({ teamId: teamIdSchema, playerId: playerIdSchema, number: z.number().int().min(1).max(32767, "Ranga jest zbyt duża.") });

export const sportSetupSchema = z.object({
  pairA: sportPairSchema,
  pairB: sportPairSchema,
  assignments: z.array(sportPlayerRankSchema),
}).superRefine((value, context) => {
  const pairTeams = [value.pairA.teamAId, value.pairA.teamBId, value.pairB.teamAId, value.pairB.teamBId];
  if (new Set(pairTeams).size !== TEAM_IDS.length) context.addIssue({ code: "custom", message: "Każda drużyna może należeć tylko do jednej pary." });
  if (value.assignments.length === 0) return;
  for (const teamId of TEAM_IDS) {
    const assignments = value.assignments.filter((assignment) => assignment.teamId === teamId);
    const ranks = assignments.map((assignment) => assignment.number).sort((left, right) => left - right);
    if (!assignments.length || new Set(ranks).size !== assignments.length || new Set(assignments.map((assignment) => assignment.playerId)).size !== assignments.length || ranks.some((rank, index) => rank !== index + 1)) {
      context.addIssue({ code: "custom", message: "Każdy zawodnik drużyny musi otrzymać inną rangę od 1 do końca listy." });
      break;
    }
  }
});

export const sportBetSchema = z.object({ targetTeamId: teamIdSchema });
export const sportWinnerSchema = z.object({ winnerTeamId: teamIdSchema });
export const sportBonusRequirementsSchema = z.object({
  requirements: z.array(z.object({ teamId: teamIdSchema, limbs: z.number().int().min(0, "Liczba kończyn nie może być ujemna.").max(100, "Liczba kończyn jest zbyt duża.") })).length(4, "Ustaw wymaganie dla każdej drużyny."),
}).refine((value) => new Set(value.requirements.map((requirement) => requirement.teamId)).size === TEAM_IDS.length, "Każda drużyna może mieć tylko jedno wymaganie.");
export const sportBonusWinnerSchema = z.object({ winnerTeamId: teamIdSchema, points: z.number().int().min(0, "Liczba punktów nie może być ujemna.").max(100, "Liczba punktów jest zbyt duża.") });

export const melodiaBetSchema = z.object({
  targetTeamId: teamIdSchema,
  stake: z.string().trim().regex(/^\d{1,16}(?:\.\d{1,4})?$/, "Podaj dodatnią liczbę żetonów z dokładnością do 4 miejsc po przecinku.").refine((value) => Number(value) > 0, "Stawka musi być większa od zera."),
});

const melodiaBidSchema = z.object({ teamId: teamIdSchema, declaredLines: z.number().int().min(0).max(5) });

export const melodiaBiddingSchema = z.object({
  enabled: z.boolean(),
  bids: z.array(melodiaBidSchema),
  winningBidderTeamId: teamIdSchema.nullable(),
  completed: z.boolean(),
}).superRefine((value, context) => {
  if (!value.enabled) {
    if (value.bids.length || value.winningBidderTeamId !== null) context.addIssue({ code: "custom", message: "Przy wyłączonej licytacji nie wybieraj drużyn." });
    return;
  }
  if (!value.bids.length || new Set(value.bids.map((bid) => bid.teamId)).size !== value.bids.length || !value.winningBidderTeamId || !value.bids.some((bid) => bid.teamId === value.winningBidderTeamId)) {
    context.addIssue({ code: "custom", message: "W licytacji wybierz uczestników i zwycięskiego licytanta." });
  }
});

export const melodiaScoreSchema = z.object({
  winnerTeamId: teamIdSchema,
  artistCorrect: z.boolean(),
  titleCorrect: z.boolean(),
  singingPoints: z.number().int().min(0).max(5),
  singingMistake: z.boolean(),
  bidding: melodiaBiddingSchema,
});

const solenizantQuestionIndexSchema = z
  .number()
  .int("Numer pytania musi być liczbą całkowitą.")
  .min(0, "Nieprawidłowy numer pytania.")
  .max(SOLENIZANT_LAST_QUESTION_INDEX, "Nieprawidłowy numer pytania.");

export const solenizantScoringStageSchema = z.object({
  questionIndex: solenizantQuestionIndexSchema,
});

export const solenizantScoreSchema = z.object({
  questionIndex: solenizantQuestionIndexSchema,
  teamIds: z
    .array(teamIdSchema)
    .max(TEAM_IDS.length, "Wybrano zbyt wiele drużyn.")
    .refine((teamIds) => new Set(teamIds).size === teamIds.length, "Drużyna może zostać wybrana tylko raz."),
});

export function normalizeNickname(nickname: string) {
  return nickname.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isReservedNickname(nickname: string) {
  return nickname.toLocaleLowerCase() === "admin";
}
