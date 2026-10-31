const encoder = new TextEncoder();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Shorter secrets make the HMAC brute-forceable; 32 bytes matches SHA-256's output size.
const MIN_SECRET_LENGTH = 32;

// Domain-separates this signature from any other HMAC made with the same secret later.
const PURPOSE = "haunted-lakehouse/session/v1:";

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

/** Signs a player id and its expiry into a token of the form `<playerId>.<expiresAt>.<signature>`. */
export async function signSessionToken(
  playerId: string,
  expiresAt: number,
  secret: string,
): Promise<string> {
  if (!UUID.test(playerId)) {
    throw new Error("A session's player id must be a lowercase UUID.");
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 0) {
    throw new Error("A session's expiry must be a whole number of Unix seconds.");
  }
  const payload = `${playerId}.${String(expiresAt)}`;
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(PURPOSE + payload));
  return `${payload}.${toBase64Url(signature)}`;
}

/**
 * Returns the player id inside a session token, or null if the token is malformed, expired
 * at `now` (Unix seconds), or its signature does not match. The expiry is signed, so a copied
 * cookie stops working when it lapses even if the client ignores the cookie's own lifetime.
 * Verification goes through `crypto.subtle.verify`, which compares in constant time.
 */
export async function verifySessionToken(
  token: string,
  now: number,
  secret: string,
): Promise<string | null> {
  const [playerId, expiresAt, signature, ...rest] = token.split(".");
  if (playerId === undefined || expiresAt === undefined || signature === undefined) return null;
  if (rest.length > 0 || !UUID.test(playerId) || !/^[0-9]{1,15}$/.test(expiresAt)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    encoder.encode(`${PURPOSE}${playerId}.${expiresAt}`),
  );
  return valid && Number(expiresAt) > now ? playerId : null;
}
