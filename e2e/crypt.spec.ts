import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const ROOMS = [
  { name: "The Codex", path: "/crypt/codex" },
  { name: "The Graveyard", path: "/crypt/graveyard" },
  { name: "The Ledger", path: "/crypt/ledger" },
  { name: "Characters", path: "/crypt/characters" },
  { name: "The Daily Haunt", path: "/crypt/daily", title: "Today’s haunt isn’t posted." },
] as const;

const rooms = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Rooms of the Crypt" }).getByRole("link");

test("the Crypt lists its five rooms with a new player's counts", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crypt");

  await expect(page.getByRole("heading", { level: 1, name: "The Crypt" })).toBeVisible();
  await expect(rooms(page)).toHaveCount(ROOMS.length);
  for (const [index, room] of ROOMS.entries()) {
    await expect(rooms(page).nth(index)).toHaveAttribute("href", room.path);
    await expect(rooms(page).nth(index)).toContainText(room.name);
  }
  // No session yet: a new player holds the Intern, no autopsies, and no pages.
  await expect(rooms(page).filter({ hasText: "The Codex" })).toContainText("0 of 3 written");
  await expect(rooms(page).filter({ hasText: "Characters" })).toContainText("1 of 4 unlocked");
  await expect(rooms(page).filter({ hasText: "The Ledger" })).toContainText("0 of 7 pages found");
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveAttribute(
    "href",
    "/run/new",
  );

  expect(errors).toEqual([]);
});

test("every closed room answers with its own page and a way back", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  for (const room of ROOMS) {
    if (!("title" in room)) continue;
    await page.goto("/crypt");
    await rooms(page).filter({ hasText: room.name }).click();
    await expect(page).toHaveURL(room.path);
    await expect(page.getByRole("heading", { level: 1, name: room.title })).toBeVisible();
    await page.getByRole("link", { name: "Back to the Crypt" }).click();
    await expect(page).toHaveURL("/crypt");
  }
  expect(errors).toEqual([]);
});

test("Characters opens onto the character select", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crypt");
  await rooms(page).filter({ hasText: "Characters" }).click();
  await expect(page).toHaveURL("/run/new");
  await expect(page.getByRole("heading", { level: 1, name: "Who takes the night?" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the keyboard walks the Crypt in reading order", async ({ page }) => {
  await page.goto("/crypt");
  const order = ["Enter the night", "Back to Hollow Creek", ...ROOMS.map((room) => room.name)];
  for (const name of order) {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toContainText(name);
  }
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL("/crypt/daily");
});

test("the hub works before any script runs", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/crypt");
  await expect(rooms(page)).toHaveCount(ROOMS.length);
  await expect(rooms(page).first()).toHaveAttribute("href", "/crypt/codex");
  await context.close();
});

test("the landing page leads to the Crypt", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Visit the Crypt" }).click();
  await expect(page).toHaveURL("/crypt");
});

test.describe("gallery states", () => {
  test("counts read for a player partway through, and complete", async ({ page }) => {
    await page.goto("/dev/crypt?state=midway");
    await expect(rooms(page).filter({ hasText: "The Codex" })).toContainText("2 of 3 written");
    await expect(rooms(page).filter({ hasText: "Characters" })).toContainText("2 of 4 unlocked");
    await expect(rooms(page).filter({ hasText: "The Ledger" })).toContainText("3 of 7 pages found");
    await page.goto("/dev/crypt?state=complete");
    await expect(rooms(page).filter({ hasText: "The Codex" })).toContainText("All 3 written");
    await expect(rooms(page).filter({ hasText: "Characters" })).toContainText("All 4 unlocked");
    await expect(rooms(page).filter({ hasText: "The Ledger" })).toContainText("All 7 pages found");
  });

  test("unreadable counts are left out, not guessed", async ({ page }) => {
    await page.goto("/dev/crypt?state=unavailable");
    await expect(rooms(page)).toHaveCount(ROOMS.length);
    await expect(page.getByText(/unlocked|pages found|written/)).toHaveCount(0);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the hub reads the same", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/crypt");
    await expect(rooms(page)).toHaveCount(ROOMS.length);
    expect(errors).toEqual([]);
  });
});

test("the Crypt fits a phone without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/crypt");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test("screenshots the Crypt at the review widths and on a phone", async ({ page }, testInfo) => {
  for (const width of [375, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.goto("/dev/crypt?state=midway");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: testInfo.outputPath(`crypt-${String(width)}.png`),
      fullPage: true,
    });
    await page.goto("/crypt/daily");
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`crypt-room-${String(width)}.png`) });
  }
});
