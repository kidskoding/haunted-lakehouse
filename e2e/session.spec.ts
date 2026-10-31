import { expect, test } from "@playwright/test";

test("a new visitor gets an anonymous session that persists across requests", async ({
  request,
}) => {
  const first = await request.post("/api/session");
  expect(first.status()).toBe(201);
  const { playerId } = (await first.json()) as { playerId: string };
  expect(playerId).toMatch(/^[0-9a-f-]{36}$/);

  const cookie = first.headers()["set-cookie"] ?? "";
  expect(cookie).toContain("HttpOnly");
  expect(cookie.toLowerCase()).toContain("samesite=lax");

  const second = await request.post("/api/session");
  expect(second.status()).toBe(200);
  expect(await second.json()).toEqual({ playerId });
});

test("a tampered session cookie is replaced with a fresh anonymous player", async ({
  playwright,
  baseURL,
}) => {
  const request = await playwright.request.newContext({
    baseURL: baseURL ?? "",
    extraHTTPHeaders: {
      cookie: "hl_session=00000000-0000-4000-8000-000000000000.forged",
    },
  });
  const response = await request.post("/api/session");
  expect(response.status()).toBe(201);
  const { playerId } = (await response.json()) as { playerId: string };
  expect(playerId).not.toBe("00000000-0000-4000-8000-000000000000");
  await request.dispose();
});
