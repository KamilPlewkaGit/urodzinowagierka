import "server-only";

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

import { createSession, getSession } from "@/lib/database";
import type { Session } from "@/lib/types";

export const SESSION_COOKIE = "casino_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

export async function createPlayerSession(playerId: number) {
  return createSession({ role: "player", playerId, expiresAt: sessionExpiresAt() });
}

export async function createAdminSession() {
  return createSession({ role: "admin", expiresAt: sessionExpiresAt() });
}

export async function createObserverSession() {
  return createSession({ role: "observer", expiresAt: sessionExpiresAt() });
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
  return getSession(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getRequestSession(request: NextRequest): Promise<Session | null> {
  return getSession(request.cookies.get(SESSION_COOKIE)?.value);
}
