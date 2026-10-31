import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const hours = (page: Page) => page.getByRole("region", { name: "Autopsies" }).getByRole("listitem");
const hourHeadings = (page: Page) =>
  page.getByRole("region", { name: "Autopsies" }).getByRole("heading", { level: 2 });

test("a visitor with no session finds every page of the Codex unwritten", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crypt/codex");
  await expect(page.getByRole("heading", { level: 1, name: "The Codex" })).toBeVisible();
  await expect(page.getByText("0 of 3 written")).toBeVisible();
  await expect(hours(page)).toHaveCount(3);
  await expect(hourHeadings(page)).toHaveText([
    "Porch Lights, not yet written",
    "The Thirteenth Door, not yet written",
    "The Possessed Feed, not yet written",
  ]);
  await expect(hours(page).nth(0)).toContainText("6:00pm");
  // Nothing to open: a locked hour carries no autopsy, not even hidden.
  await expect(page.locator("details")).toHaveCount(0);
  await expect(page.getByText("Event logs are not state")).toHaveCount(0);

  await page.getByRole("link", { name: "Back to the Crypt" }).click();
  await expect(page).toHaveURL("/crypt");
  expect(errors).toEqual([]);
});

test("the hub's Codex leads here", async ({ page }) => {
  await page.goto("/crypt");
  await page
    .getByRole("navigation", { name: "Rooms of the Crypt" })
    .getByRole("link", { name: /The Codex/ })
    .click();
  await expect(page).toHaveURL("/crypt/codex");
  await expect(page.getByRole("heading", { level: 1, name: "The Codex" })).toBeVisible();
});

test("an earned autopsy opens from the keyboard; the rest stay locked", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/codex?state=some");
  await expect(page.getByText("1 of 3 written")).toBeVisible();
  await expect(hourHeadings(page)).toHaveText([
    "Porch Lights",
    "The Thirteenth Door, not yet written",
    "The Possessed Feed, not yet written",
  ]);
  await expect(page.locator("details")).toHaveCount(1);
  // The locked hours ship no autopsy text at all.
  await expect(page.getByText("A gauge is not a counter")).toHaveCount(0);
  await expect(page.getByText("Schema drift and rescued values")).toHaveCount(0);

  const summary = page.locator("summary");
  await expect(summary).toHaveText("Event logs are not state");
  await expect(page.getByRole("heading", { name: "The idea" })).toBeHidden();

  await page.getByRole("link", { name: "Back to the Crypt" }).focus();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  const card = page.getByRole("article", { name: "What really happened in Porch Lights" });
  await expect(card.getByRole("heading", { name: "The idea" })).toBeVisible();
  await expect(card).toContainText("From the night of raven-pumpkin-13");
  await expect(card.locator('[data-segment="value"]').first()).toBeVisible();
  await expect(card.getByText("event sourcing")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("heading", { name: "The idea" })).toBeHidden();
  expect(errors).toEqual([]);
});

test("every autopsy written reads All 3 written", async ({ page }) => {
  await page.goto("/dev/codex?state=all");
  await expect(page.getByText("All 3 written")).toBeVisible();
  await expect(page.locator("details")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: /not yet written/ })).toHaveCount(0);
  // The Fog lifts once an hour is cleared.
  await expect(page.locator('[data-segment="fog"]')).toHaveCount(0);
});

test("an unreadable Codex says so instead of looking empty", async ({ page }) => {
  await page.goto("/dev/codex?state=unavailable");
  await expect(page.getByRole("status")).toContainText("Wren can’t find the Codex tonight.");
  await expect(hours(page)).toHaveCount(0);
  await expect(page.getByText(/written/)).toHaveCount(0);
});

test("the Codex works before any script runs", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/dev/codex?state=some");
  await page.locator("summary").click();
  await expect(page.getByRole("heading", { name: "The idea" })).toBeVisible();
  await context.close();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the disclosure opens without a turn", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/dev/codex?state=some");
    await expect(page.locator("summary svg")).toHaveCSS("transition-property", "none");
    await page.locator("summary").click();
    await expect(page.getByRole("heading", { name: "The idea" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("screenshots every state at the review widths and on a phone", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  for (const width of [375, 1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const state of ["empty", "some", "all", "unavailable"] as const) {
      await page.goto(`/dev/codex?state=${state}`);
      const first = page.locator("summary").first();
      if ((await first.count()) > 0) await first.click();
      await page.screenshot({
        path: testInfo.outputPath(`codex-${state}-${String(width)}.png`),
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
