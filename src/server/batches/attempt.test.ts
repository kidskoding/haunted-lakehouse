import { describe, expect, it } from "vitest";
import { NIGHT_ATTEMPT_TTL_SECONDS, signNightAttempt, verifyNightAttempt } from "./attempt";

const secret = "a".repeat(32);
const otherSecret = "b".repeat(32);
const playerId = "6f1c2b9e-3a4d-4c5e-8f70-1a2b3c4d5e6f";
const runId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const puzzleId = "porch-lights";
const now = 1_793_404_800;
const expiresAt = now + NIGHT_ATTEMPT_TTL_SECONDS;

const attempt = { playerId, runId, puzzleId, expiresAt };

describe("night attempt tokens", () => {
  it("round-trips an attempt before it expires", async () => {
    const token = await signNightAttempt(attempt, secret);
    expect(await verifyNightAttempt(token, now, secret)).toEqual(attempt);
    expect(await verifyNightAttempt(token, expiresAt - 1, secret)).toEqual(attempt);
  });

  it("rejects the token from its expiry onward", async () => {
    const token = await signNightAttempt(attempt, secret);
    expect(await verifyNightAttempt(token, expiresAt, secret)).toBeNull();
  });

  it("rejects a token whose expiry was extended", async () => {
    const parts = (await signNightAttempt(attempt, secret)).split(".");
    const forged = [parts[0], parts[1], parts[2], String(expiresAt + 3600), parts[4]].join(".");
    expect(await verifyNightAttempt(forged, expiresAt + 1, secret)).toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signNightAttempt(attempt, otherSecret);
    expect(await verifyNightAttempt(token, now, secret)).toBeNull();
  });

  it("rejects a token whose run id was swapped", async () => {
    const parts = (await signNightAttempt(attempt, secret)).split(".");
    const forged = [
      parts[0],
      "00000000-0000-4000-8000-000000000000",
      parts[2],
      parts[3],
      parts[4],
    ].join(".");
    expect(await verifyNightAttempt(forged, now, secret)).toBeNull();
  });

  it.each([
    "",
    `${playerId}.${runId}`,
    `${playerId}.${runId}.${puzzleId}.${String(expiresAt)}`,
    `${playerId}.${runId}.${puzzleId}.${String(expiresAt)}.sig.extra`,
    `${playerId}.${runId}.Porch_Lights.${String(expiresAt)}.abc`,
  ])("rejects the malformed token %j", async (token) => {
    expect(await verifyNightAttempt(token, now, secret)).toBeNull();
  });
});
