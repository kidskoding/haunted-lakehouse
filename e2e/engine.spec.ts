import { expect, test } from "@playwright/test";

test("the engine loads in the background from our own origin and answers queries", async ({
  page,
  baseURL,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    // The app ships no favicon yet; the browser's automatic request for one is not ours.
    if (message.type() === "error" && !message.location().url.endsWith("/favicon.ico")) {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  const foreignRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== baseURL) foreignRequests.push(request.url());
  });

  await page.goto("/?engine-selftest");
  // The landing page is usable while the engine is still loading.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(page.locator("[data-engine-status]")).toHaveAttribute(
    "data-engine-status",
    "ready",
    { timeout: 60_000 },
  );

  const report = page.locator("[data-engine-selftest]");
  await expect(report).toBeAttached({ timeout: 30_000 });
  expect(JSON.parse((await report.getAttribute("data-engine-selftest")) ?? "null")).toEqual({
    ok: true,
    result: {
      query: { columns: ["n", "at", "bowl"], rows: [["42", "2026-10-31 18:00:00", "12.50"]] },
      canonical: {
        columns: ["house", "lights"],
        rows: [
          ["Maple", "on"],
          ["Willow", "off"],
        ],
      },
      sqlError: "sql",
      tablesAfterReset: [["0"]],
      fileAfterReset: "sql",
    },
  });

  expect(foreignRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("the engine status starts without the self-test", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-engine-status]")).toHaveAttribute(
    "data-engine-status",
    "ready",
    { timeout: 60_000 },
  );
  await expect(page.locator("[data-engine-selftest]")).toHaveCount(0);
});
