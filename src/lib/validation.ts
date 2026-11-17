import { z } from "zod";

import { TEAM_IDS } from "@/lib/constants";

export const nicknameSchema = z
  .string()
  .trim()
  .min(2, "Nickname must have at least 2 characters.")
  .max(24, "Nickname can have at most 24 characters.")
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _.\-]*$/u, "Use letters, numbers, spaces, dots, hyphens, or underscores.");

export const teamIdSchema = z.enum(TEAM_IDS);

export const playerRegistrationSchema = z.object({
  nickname: nicknameSchema,
  teamId: teamIdSchema,
});

export const adminLoginSchema = z.object({
  password: z.string().min(1, "Password is required.").max(256, "Password is too long."),
});

export function normalizeNickname(nickname: string) {
  return nickname.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function isReservedNickname(nickname: string) {
  return nickname.toLocaleLowerCase() === "admin";
}
