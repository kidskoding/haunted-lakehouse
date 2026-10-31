import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./token";

const secret = "a".repeat(32);
const otherSecret = "b".repeat(32);
const playerId = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";

describe("session tokens", () => {
  it("round-trips a player id", async () => {
    const token = await signSessionToken(playerId, secret);
    expect(await verifySessionToken(token, secret)).toBe(playerId);
  });

  it("is deterministic for the same player and secret", async () => {
    expect(await signSessionToken(playerId, secret)).toBe(await signSessionToken(playerId, secret));
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSessionToken(playerId, otherSecret);
    expect(await verifySessionToken(token, secret)).toBeNull();
  });

  it("rejects a token whose player id was swapped", async () => {
    const token = await signSessionToken(playerId, secret);
    const signature = token.split(".")[1] ?? "";
    const forged = `00000000-0000-4000-8000-000000000000.${signature}`;
    expect(await verifySessionToken(forged, secret)).toBeNull();
  });

  it.each([
    "",
    playerId,
    `${playerId}.`,
    `${playerId}.abc.def`,
    `not-a-uuid.abc`,
    `${playerId}.not base64!`,
  ])("rejects the malformed token %j", async (token) => {
    expect(await verifySessionToken(token, secret)).toBeNull();
  });

  it("refuses a secret too short to be safe", async () => {
    await expect(signSessionToken(playerId, "short")).rejects.toThrow(/at least 32/);
    await expect(verifySessionToken(`${playerId}.abc`, "short")).rejects.toThrow(/at least 32/);
  });

  it("refuses to sign anything but a UUID", async () => {
    await expect(signSessionToken("player.1", secret)).rejects.toThrow(/UUID/);
  });
});
