import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import type { Session } from "@/lib/types";

export const SESSION_COOKIE = "casino_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encode(value: object) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function createPlayerSession(playerId: number) {
  return encode({ role: "player", playerId, expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
}

export function createAdminSession() {
  return encode({ role: "admin", expiresAt: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS });
}

export function verifySession(value: string | undefined): Session | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, receivedSignature] = parts;
  if (!payload || !receivedSignature) return null;

  const expectedSignature = sign(payload);
  const received = Buffer.from(receivedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || !("expiresAt" in decoded) || typeof decoded.expiresAt !== "number") return null;
    if (decoded.expiresAt < Math.floor(Date.now() / 1000)) return null;
    if ("role" in decoded && decoded.role === "admin") return { role: "admin", expiresAt: decoded.expiresAt };
    if (
      "role" in decoded &&
      decoded.role === "player" &&
      "playerId" in decoded &&
      typeof decoded.playerId === "number"
    ) {
      return { role: "player", playerId: decoded.playerId, expiresAt: decoded.expiresAt };
    }
  } catch {
    return null;
  }
  return null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export async function getCurrentSession() {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(SESSION_COOKIE)?.value);
}

export function getRequestSession(request: NextRequest) {
  return verifySession(request.cookies.get(SESSION_COOKIE)?.value);
}
