import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "./token";

const secret = "a".repeat(32);
const otherSecret = "b".repeat(32);
const playerId = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
const now = 1_793_404_800;
const expiresAt = now + 3600;

describe("session tokens", () => {
  it("round-trips a player id before the token expires", async () => {
    const token = await signSessionToken(playerId, expiresAt, secret);
    expect(await verifySessionToken(token, now, secret)).toBe(playerId);
    expect(await verifySessionToken(token, expiresAt - 1, secret)).toBe(playerId);
  });

  it("rejects the token from its expiry onward", async () => {
    const token = await signSessionToken(playerId, expiresAt, secret);
    expect(await verifySessionToken(token, expiresAt, secret)).toBeNull();
    expect(await verifySessionToken(token, expiresAt + 86_400, secret)).toBeNull();
  });

  it("rejects a token whose expiry was extended", async () => {
    const [id, , signature] = (await signSessionToken(playerId, expiresAt, secret)).split(".");
    const extended = `${id ?? ""}.${String(expiresAt + 31_536_000)}.${signature ?? ""}`;
    expect(await verifySessionToken(extended, expiresAt + 1, secret)).toBeNull();
  });

  it("is deterministic for the same player, expiry, and secret", async () => {
    expect(await signSessionToken(playerId, expiresAt, secret)).toBe(
      await signSessionToken(playerId, expiresAt, secret),
    );
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSessionToken(playerId, expiresAt, otherSecret);
    expect(await verifySessionToken(token, now, secret)).toBeNull();
  });

  it("rejects a token whose player id was swapped", async () => {
    const [, expiry, signature] = (await signSessionToken(playerId, expiresAt, secret)).split(".");
    const forged = `00000000-0000-4000-8000-000000000000.${expiry ?? ""}.${signature ?? ""}`;
    expect(await verifySessionToken(forged, now, secret)).toBeNull();
  });

  it.each([
    "",
    playerId,
    `${playerId}.${String(expiresAt)}`,
    `${playerId}.${String(expiresAt)}.`,
    `${playerId}.${String(expiresAt)}.abc.def`,
    `${playerId}.soon.abc`,
    `${playerId}.-1.abc`,
    `not-a-uuid.${String(expiresAt)}.abc`,
    `${playerId}.${String(expiresAt)}.not base64!`,
  ])("rejects the malformed token %j", async (token) => {
    expect(await verifySessionToken(token, now, secret)).toBeNull();
  });

  it("refuses a secret too short to be safe", async () => {
    await expect(signSessionToken(playerId, expiresAt, "short")).rejects.toThrow(/at least 32/);
    await expect(
      verifySessionToken(`${playerId}.${String(expiresAt)}.abc`, now, "short"),
    ).rejects.toThrow(/at least 32/);
  });

  it("refuses to sign anything but a UUID and a whole-second expiry", async () => {
    await expect(signSessionToken("player.1", expiresAt, secret)).rejects.toThrow(/UUID/);
    await expect(signSessionToken(playerId, 1.5, secret)).rejects.toThrow(/Unix seconds/);
  });
});
