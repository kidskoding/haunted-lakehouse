import "server-only";
import { cookies } from "next/headers";
import { signSessionToken, verifySessionToken } from "./token";

export const SESSION_COOKIE = "hl_session";

// Anonymous progress lives only behind this cookie until the player signs in, so it should
// outlast a season of play rather than a browser session.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. See .env.example.");
  }
  return secret;
}

/** Returns the player id from a valid session cookie, or null when there is none. */
export async function currentPlayerId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token, sessionSecret()) : null;
}

/**
 * Returns the current player id, first issuing a new anonymous player and its signed cookie
 * if the request has no valid session. Only callable where cookies can be set: route
 * handlers and server actions.
 */
export async function ensurePlayerId(): Promise<{ playerId: string; created: boolean }> {
  const existing = await currentPlayerId();
  if (existing) return { playerId: existing, created: false };

  const playerId = crypto.randomUUID();
  (await cookies()).set(SESSION_COOKIE, await signSessionToken(playerId, sessionSecret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return { playerId, created: true };
}
