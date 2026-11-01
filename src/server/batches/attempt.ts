const encoder = new TextEncoder();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PUZZLE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MIN_SECRET_LENGTH = 32;

// Domain-separates night-attempt signatures from the anonymous session cookie.
const PURPOSE = "haunted-lakehouse/night-attempt/v2:";

/** How long a night attempt stays open: long enough to replay an hour, short enough to limit leaks. */
export const NIGHT_ATTEMPT_TTL_SECONDS = 15 * 60;

export interface NightAttempt {
  readonly playerId: string;
  readonly runId: string;
  readonly puzzleId: string;
  /** The `attempt_started` event this token belongs to; the judge takes only the open one. */
  readonly attemptId: string;
  readonly expiresAt: number;
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`The session secret must be at least ${String(MIN_SECRET_LENGTH)} characters.`);
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function payloadOf(attempt: NightAttempt): string {
  const { playerId, runId, puzzleId, attemptId, expiresAt } = attempt;
  return `${playerId}.${runId}.${puzzleId}.${attemptId}.${String(expiresAt)}`;
}

/** Signs a run-the-night attempt into `<player>.<run>.<puzzle>.<attempt>.<expires>.<sig>`. */
export async function signNightAttempt(attempt: NightAttempt, secret: string): Promise<string> {
  if (!UUID.test(attempt.playerId) || !UUID.test(attempt.runId) || !UUID.test(attempt.attemptId)) {
    throw new Error("A night attempt's player, run, and attempt ids must be lowercase UUIDs.");
  }
  if (!PUZZLE_ID.test(attempt.puzzleId)) {
    throw new Error("A night attempt's puzzle id must be a lowercase kebab-case id.");
  }
  if (!Number.isSafeInteger(attempt.expiresAt) || attempt.expiresAt < 0) {
    throw new Error("A night attempt's expiry must be a whole number of Unix seconds.");
  }
  const payload = payloadOf(attempt);
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(PURPOSE + payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/**
 * Returns the attempt inside a token, or null when it is malformed, expired at `now`, or its
 * signature does not match. Verification uses constant-time compare via `crypto.subtle.verify`.
 */
export async function verifyNightAttempt(
  token: string,
  now: number,
  secret: string,
): Promise<NightAttempt | null> {
  const [playerId, runId, puzzleId, attemptId, expiresAt, signature, ...rest] = token.split(".");
  if (
    playerId === undefined ||
    runId === undefined ||
    puzzleId === undefined ||
    attemptId === undefined ||
    expiresAt === undefined ||
    signature === undefined ||
    rest.length > 0
  ) {
    return null;
  }
  if (!UUID.test(playerId) || !UUID.test(runId) || !UUID.test(attemptId)) return null;
  if (!PUZZLE_ID.test(puzzleId)) return null;
  if (!/^[0-9]{1,15}$/.test(expiresAt) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const attempt: NightAttempt = {
    playerId,
    runId,
    puzzleId,
    attemptId,
    expiresAt: Number(expiresAt),
  };
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    encoder.encode(PURPOSE + payloadOf(attempt)),
  );
  return valid && attempt.expiresAt > now ? attempt : null;
}
