import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

const book = (page: Page) => page.getByRole("region", { name: "Ledger pages" });
const pageHeadings = (page: Page) => book(page).getByRole("heading", { level: 2 });

test("a visitor with no session finds every page of the Ledger torn out", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crypt/ledger");
  await expect(page.getByRole("heading", { level: 1, name: "The Ledger" })).toBeVisible();
  await expect(page.getByText("0 of 7 pages found")).toBeVisible();
  await expect(pageHeadings(page)).toHaveText(NUMERALS.map((n) => `Page ${n}, torn out`));
  // A torn page is a gap: nothing of its text, not even its year, reaches the page.
  await expect(book(page)).not.toContainText("Hallowe'en");
  await expect(book(page)).not.toContainText("2020");
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to the Crypt" }).click();
  await expect(page).toHaveURL("/crypt");
  expect(errors).toEqual([]);
});

test("the hub's Ledger leads here", async ({ page }) => {
  await page.goto("/crypt");
  await page
    .getByRole("navigation", { name: "Rooms of the Crypt" })
    .getByRole("link", { name: /The Ledger/ })
    .click();
  await expect(page).toHaveURL("/crypt/ledger");
  await expect(page.getByRole("heading", { level: 1, name: "The Ledger" })).toBeVisible();
});

test("found pages read in full in Hollow green; the rest stay torn", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/ledger?state=some");
  await expect(page.getByText("3 of 7 pages found")).toBeVisible();
  await expect(pageHeadings(page)).toHaveText([
    "Page I",
    "Page II, torn out",
    "Page III",
    "Page IV, torn out",
    "Page V, torn out",
    "Page VI",
    "Page VII, torn out",
  ]);
  await expect(book(page)).toContainText("Kept by Eliza Wren.");
  await expect(book(page)).toContainText("Storage is a line item.");
  // Unfound pages ship nothing of themselves.
  await expect(book(page)).not.toContainText("Board of Health");
  await expect(book(page)).not.toContainText("Town Charter");
  await expect(pageHeadings(page).nth(0)).toHaveCSS("color", "rgb(166, 214, 94)");
  await expect(pageHeadings(page).nth(1)).not.toHaveCSS("color", "rgb(166, 214, 94)");
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("all seven found, Wren points to the night that keeps them", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/ledger?state=all");
  await expect(page.getByText("All 7 pages found")).toBeVisible();
  await expect(pageHeadings(page)).toHaveText(NUMERALS.map((n) => `Page ${n}`));
  await expect(page.getByText("Seven pages. All of them. Tonight we finish it.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveAttribute(
    "href",
    "/run/new",
  );
  expect(errors).toEqual([]);
});

test("an unreadable Ledger says so instead of looking empty", async ({ page }) => {
  await page.goto("/dev/ledger?state=unavailable");
  await expect(page.getByRole("status")).toContainText("Wren can’t find the Ledger tonight.");
  await expect(pageHeadings(page)).toHaveCount(0);
  await expect(page.getByText(/pages found/)).toHaveCount(0);
});

test("the keyboard walks the Ledger in reading order", async ({ page }) => {
  await page.goto("/dev/ledger?state=all");
  await page.getByRole("link", { name: "Back to the Crypt" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Enter the night" })).toBeFocused();
});

test("the Ledger works before any script runs", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/dev/ledger?state=some");
  await expect(book(page)).toContainText("Kept by Eliza Wren.");
  await context.close();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("Wren's word is there at once", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/dev/ledger?state=all");
    await expect(page.getByText("Seven pages. All of them. Tonight we finish it.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("screenshots every state at the review widths and on a phone", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  for (const width of [375, 1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
    for (const state of ["none", "some", "all", "unavailable"] as const) {
      await page.goto(`/dev/ledger?state=${state}`);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath(`ledger-${state}-${String(width)}.png`),
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
