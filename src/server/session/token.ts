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

/** Signs a player id into a session token of the form `<playerId>.<signature>`. */
export async function signSessionToken(playerId: string, secret: string): Promise<string> {
  if (!UUID.test(playerId)) {
    throw new Error("A session's player id must be a lowercase UUID.");
  }
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(PURPOSE + playerId));
  return `${playerId}.${toBase64Url(signature)}`;
}

/**
 * Returns the player id inside a session token, or null if the token is malformed or its
 * signature does not match. Verification goes through `crypto.subtle.verify`, which compares
 * in constant time.
 */
export async function verifySessionToken(token: string, secret: string): Promise<string | null> {
  const [playerId, signature, ...rest] = token.split(".");
  if (playerId === undefined || signature === undefined || rest.length > 0) return null;
  if (!UUID.test(playerId) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    Buffer.from(signature, "base64url"),
    encoder.encode(PURPOSE + playerId),
  );
  return valid ? playerId : null;
}
