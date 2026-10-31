import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const STATES = [
  "fresh",
  "empty",
  "in-progress",
  "finished",
  "no-result",
  "capped",
  "loading",
  "unavailable",
] as const;

// The gallery's fixed moment: 17:48 UTC on Halloween.
const SEED = "phantom-gumdrop-79";

const board = (page: Page) => page.getByRole("region", { name: "Today’s board" });
const begin = (page: Page) => page.getByRole("link", { name: "Begin today’s haunt" });

test("the hub's Daily Haunt posts today's seed", async ({ page }) => {
  await page.goto("/crypt");
  await page
    .getByRole("navigation", { name: "Rooms of the Crypt" })
    .getByRole("link", { name: /The Daily Haunt/ })
    .click();
  await expect(page).toHaveURL("/crypt/daily");
  await expect(page.getByRole("heading", { level: 1, name: "The Daily Haunt" })).toBeVisible();
  await expect(page.getByText(/^[a-z]+-[a-z]+-[1-9][0-9]?$/)).toBeVisible();
  await expect(page.locator("time")).toHaveAttribute("datetime", /T00:00:00\.000Z$/);
  // The test server has no database, so the board says it can't be read rather than look empty.
  await expect(board(page).getByRole("status")).toContainText("Wren can’t read the board");
  await expect(begin(page)).toHaveCount(0);
  await page.getByRole("link", { name: "Back to the Crypt" }).click();
  await expect(page).toHaveURL("/crypt");
});

test("a new hire can begin today's haunt on the day's seed", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/daily?state=fresh");
  await expect(page.getByText(SEED, { exact: true })).toBeVisible();
  await expect(page.getByText("Saturday, October 31.", { exact: false })).toBeVisible();
  await expect(page.getByText("in 6 hours 12 minutes")).toBeVisible();
  await expect(begin(page)).toHaveAttribute("href", `/run/new?seed=${SEED}&daily=1`);
  await expect(page.getByText("One attempt. The moment it begins, it counts.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the board ranks today's nights, ties sharing a place, handles only for sign-ins", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/daily?state=finished");
  const rows = board(page).getByRole("row");
  await expect(rows.first()).toHaveText(/Place\s*Who\s*Hours cleared\s*Candles left/);
  await expect(rows.nth(1)).toHaveText(/1\s*marisol-counts\s*10\s*2/);
  await expect(rows.nth(2)).toHaveText(/2\s*A New Hire\s*10\s*0/);
  await expect(rows.nth(3)).toHaveText(/3\s*wren/);
  await expect(rows.nth(4)).toHaveText(/3\s*thorne/);
  await expect(rows.nth(6)).toHaveText(/6\s*A New Hire \(you\)\s*4\s*2/);
  await expect(board(page)).toContainText("8 new hires have finished today.");
  expect(errors).toEqual([]);
});

test("a capped board says how many it leaves out", async ({ page }) => {
  await page.goto("/dev/daily?state=capped");
  await expect(board(page).getByRole("row")).toHaveCount(51);
  await expect(board(page)).toContainText("The top 50 of 212 who have finished today.");
});

test("an empty board invites the first name", async ({ page }) => {
  await page.goto("/dev/daily?state=empty");
  await expect(board(page)).toContainText("Nobody has finished today’s haunt yet.");
  await expect(board(page).getByRole("table")).toHaveCount(0);
  await expect(begin(page)).toBeVisible();
});

test("once attempted, the room shows the result instead of a second try", async ({ page }) => {
  await page.goto("/dev/daily?state=finished");
  await expect(begin(page)).toHaveCount(0);
  await expect(page.getByText("You’ve had your try today.")).toBeVisible();
  await expect(page.getByText("4 hours cleared, 2 candles left. 6th on the board.")).toBeVisible();

  await page.goto("/dev/daily?state=no-result");
  await expect(begin(page)).toHaveCount(0);
  await expect(page.getByText("It ended before it reached the board.")).toBeVisible();

  await page.goto("/dev/daily?state=in-progress");
  await expect(begin(page)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Return to the night" })).toHaveAttribute(
    "href",
    "/run",
  );
});

test("while the board is read, the room says so", async ({ page }) => {
  await page.goto("/dev/daily?state=loading");
  await expect(page.getByText("Reading today's board")).toBeAttached();
  await expect(page.getByText(SEED, { exact: true })).toBeVisible();
  await expect(begin(page)).toHaveCount(0);
});

test("the keyboard walks the room in reading order", async ({ page }) => {
  await page.goto("/dev/daily?state=fresh");
  await begin(page).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Back to the Crypt" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`/run/new?seed=${SEED}&daily=1`);
});

test("the room works before any script runs", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/dev/daily?state=fresh");
  await expect(page.getByText(SEED, { exact: true })).toBeVisible();
  await expect(board(page).getByRole("row")).toHaveCount(9);
  await context.close();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("everything is there at once", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/dev/daily?state=finished");
    await expect(page.getByText("You’ve had your try today.")).toBeVisible();
    await expect(board(page).getByRole("table")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("screenshots every state at the review widths and on a phone", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  for (const width of [375, 1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const state of STATES) {
      await page.goto(`/dev/daily?state=${state}`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(`daily-${state}-${String(width)}.png`),
        fullPage: true,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});
