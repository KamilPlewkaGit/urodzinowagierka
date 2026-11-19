import { z } from "zod";

import { TEAM_IDS } from "@/lib/constants";
import { SOLENIZANT_LAST_QUESTION_INDEX } from "@/lib/solenizant";

z.config(z.locales.pl());

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

const playerIdNumberSchema = z
  .number({ error: "Nieprawidłowy gracz." })
  .int("Nieprawidłowy gracz.")
  .positive("Nieprawidłowy gracz.")
  .refine(Number.isSafeInteger, "Nieprawidłowy gracz.");

/** Accepts the canonical decimal form emitted by an older BIGSERIAL snapshot. */
export const playerIdSchema = z.preprocess(
  (value) => typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : value,
  playerIdNumberSchema,
);

export const chipAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(?:\.\d{1,4})?$/, "Podaj nieujemną liczbę z dokładnością do 4 miejsc po przecinku.");

export const adminChipAdjustmentSchema = z.object({
  playerId: playerIdSchema,
  tokens: chipAmountSchema,
});

export const adminPlayerRemovalSchema = z.object({ playerId: playerIdSchema });

export const activeSegmentSchema = z.object({ segmentId: z.enum(["solenizant", "the-floor", "sport", "melodia", "pojedynki", "familiada", "gold-challenge", "alkoholicy", "finale"]) });

export const alkoholicyActionSchema = z.object({
  revision: z.uuid(),
  command: z.discriminatedUnion("action", [
    z.object({ action: z.literal("order"), teams: z.tuple([teamIdSchema, teamIdSchema, teamIdSchema, teamIdSchema]).refine((teams) => new Set(teams).size === 4) }),
    z.object({ action: z.literal("duel-teams"), teams: z.tuple([teamIdSchema, teamIdSchema]).refine(([first, second]) => first !== second) }),
    z.object({ action: z.enum(["score-charades", "correct-charades"]), teamId: teamIdSchema, points: z.number().int().min(0).max(6) }),
    z.object({ action: z.literal("finish-duel"), teamId: teamIdSchema }),
    z.object({ action: z.literal("bet"), game: z.union([z.literal(1), z.literal(2), z.literal(3)]), teamId: teamIdSchema }),
    z.object({ action: z.enum(["start", "open-charades", "start-charades", "next-team", "settle-charades", "next-game", "open-duel", "start-duel", "next-duel", "complete", "restart"]) }),
  ]),
});

export type AlkoholicyAction = z.infer<typeof alkoholicyActionSchema>;

export const goldActionSchema = z.object({
  revision: z.uuid(),
  command: z.discriminatedUnion("action", [
    z.object({ action: z.literal("teams"), teams: z.array(teamIdSchema).min(2).max(4).refine((teams) => new Set(teams).size === teams.length) }),
    z.object({ action: z.enum(["nominate", "representative", "winner", "correct-winner"]), playerId: playerIdSchema }),
    z.object({ action: z.enum(["number-vote", "number-confirm", "correct-number"]), number: z.number().int().min(1).max(6) }),
    z.object({ action: z.enum(["prepare", "start", "next-game", "number-open", "number-close", "number-settle", "number-restart", "complete", "restart"]) }),
  ]),
});

export type GoldAction = z.infer<typeof goldActionSchema>;

export const finaleActionSchema = z.object({
  revision: z.uuid(),
  command: z.discriminatedUnion("action", [
    z.object({ action: z.literal("confirm-finalists"), teams: z.tuple([teamIdSchema, teamIdSchema]).refine(([first, second]) => first !== second) }),
    z.object({ action: z.literal("estimate"), value: z.string().trim().regex(/^\d{1,12}(?:[,.]\d{1,2})?$/).transform((value) => Number(value.replace(",", "."))) }),
    z.object({ action: z.literal("direction"), value: z.enum(["more", "less"]) }),
    z.object({ action: z.enum(["confirm-winner", "overall-winner"]), teamId: teamIdSchema }),
    z.object({ action: z.literal("award"), round: z.number().int().min(1).max(4), points: z.number().int().min(0).max(2_147_483_647) }),
    z.object({ action: z.enum(["start", "reveal", "show-wheel", "next", "complete", "restart"]) }),
  ]),
});

export type FinaleAction = z.infer<typeof finaleActionSchema>;
export type FinaleCommand = z.input<typeof finaleActionSchema>["command"];

export const familiadaActionSchema = z.object({
  revision: z.uuid(),
  command: z.discriminatedUnion("action", [
    z.object({ action: z.literal("configure"), teams: z.tuple([teamIdSchema, teamIdSchema, teamIdSchema, teamIdSchema]).refine((teams) => new Set(teams).size === 4) }),
    z.object({ action: z.enum(["start", "open-betting", "close-betting", "activate", "reset-buzzer", "buzz", "mistake", "next", "complete", "restart"]) }),
    z.object({ action: z.enum(["start-question", "replace-representatives"]), players: z.tuple([playerIdSchema, playerIdSchema]) }),
    z.object({ action: z.literal("respondent"), playerId: playerIdSchema }),
    z.object({ action: z.literal("answer"), position: z.number().int().min(1).max(8) }),
    z.object({ action: z.enum(["control", "confirm-match", "bet"]), teamId: teamIdSchema }),
    z.object({ action: z.literal("correct-match"), matchIndex: z.union([z.literal(0), z.literal(1)]), teamId: teamIdSchema }),
  ]),
});

export type FamiliadaAction = z.infer<typeof familiadaActionSchema>;

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
export const teamDuelWinnerSchema = z.object({
  eventId: playerIdNumberSchema,
  winnerTeamId: teamIdSchema,
  correctionRevision: z.uuid().optional(),
});

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
export const sportBonusRequirementsSchema = z.object({
  requirements: z.array(z.object({ teamId: teamIdSchema, limbs: z.number().int().min(0, "Liczba kończyn nie może być ujemna.").max(100, "Liczba kończyn jest zbyt duża.") })).length(4, "Ustaw wymaganie dla każdej drużyny."),
}).refine((value) => new Set(value.requirements.map((requirement) => requirement.teamId)).size === TEAM_IDS.length, "Każda drużyna może mieć tylko jedno wymaganie.");
export const sportBonusWinnerSchema = z.object({ eventId: playerIdNumberSchema, winnerTeamId: teamIdSchema, points: z.number().int().min(0, "Liczba punktów nie może być ujemna.").max(100, "Liczba punktów jest zbyt duża.") });

export const melodiaTeamsSchema = z.object({
  teamIds: z.array(teamIdSchema).length(TEAM_IDS.length, "Wybierz wszystkie cztery drużyny.")
    .refine((teamIds) => new Set(teamIds).size === TEAM_IDS.length, "Każdą drużynę wybierz tylko raz."),
});

export const melodiaSongSchema = z.object({
  songId: z.number().int().positive().refine(Number.isSafeInteger, "Nieprawidłowy identyfikator piosenki."),
});

export const melodiaWinnerSchema = melodiaSongSchema.extend({ winnerTeamId: teamIdSchema });

export const melodiaScoreSchema = melodiaWinnerSchema.extend({
  artistCorrect: z.boolean(),
  titleCorrect: z.boolean(),
});

export const melodiaSettlementSchema = melodiaWinnerSchema.extend({
  rosterIds: z.array(playerIdSchema).max(10_000).refine(
    (ids) => ids.every((id, index) => index === 0 || ids[index - 1] < id),
    "Skład rozliczenia powinien zawierać unikalne identyfikatory.",
  ),
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
