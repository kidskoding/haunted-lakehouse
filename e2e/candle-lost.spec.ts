import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/candle-lost");
  await expect(page.getByRole("heading", { level: 1, name: "Candle lost" })).toBeVisible();
});

function show(page: Page, title: string) {
  return page.getByRole("button", { name: `Show: ${title}` });
}

/** Waits out the dialog's entrance and the candles going out, so a screenshot is at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

test("the gallery and every moment render without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  for (const title of [
    "An hour, one candle",
    "A boss hour, two candles",
    "A model fails on a hidden batch",
    "Wrong on data already in bronze",
  ]) {
    await show(page, title).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test("an hour gutters one candle, the cast reacts, and the batch opens", async ({ page }) => {
  await show(page, "An hour, one candle").click();
  const moment = page.getByRole("alertdialog", { name: "A candle goes out" });
  await expect(moment).toBeVisible();
  await expect(moment).toHaveAccessibleDescription(
    /^The night broke at the \d+:\d\d[ap]m checkpoint, after batch \d+: gold\.\S+ didn’t match\.$/,
  );
  await expect(moment.locator('[data-candle="lit"]')).toHaveCount(2);
  await expect(moment.locator('[data-candle="guttering"]')).toHaveCount(1);
  await expect(moment.getByText("2 of 3 candles still lit.")).toBeVisible();
  await expect(moment.getByText("The Mayor", { exact: true })).toBeVisible();
  await expect(moment.getByText(/^Batch \d+ is open in bronze now\.$/)).toBeVisible();
});

test("a boss hour gutters two candles and says why it cost two", async ({ page }) => {
  await show(page, "A boss hour, two candles").click();
  const moment = page.getByRole("alertdialog", { name: "Two candles go out" });
  await expect(moment.locator('[data-candle="guttering"]')).toHaveCount(2);
  await expect(moment.getByText("1 of 3 candles still lit. A boss hour costs two.")).toBeVisible();
  await expect(moment.getByText(/^One left\./)).toBeVisible();
});

test("an error names the model and shows its message", async ({ page }) => {
  await show(page, "A model fails on a hidden batch").click();
  const moment = page.getByRole("alertdialog", { name: "A candle goes out" });
  await expect(moment).toHaveAccessibleDescription(
    /^The night broke on batch \d+: silver\.bowl_takings failed to run \(models\/silver\/bowl_takings\.sql\)\.$/,
  );
  await expect(moment.getByText(/^More than one row of this batch's output/)).toBeVisible();
  await expect(moment.getByText("Marisol", { exact: true })).toBeVisible();
  await expect(moment.locator('[data-candle="out"]')).toHaveCount(0);
});

test("a break on visible data says nothing new opens", async ({ page }) => {
  await show(page, "Wrong on data already in bronze").click();
  const moment = page.getByRole("alertdialog");
  await expect(
    moment.getByText(/^Batch \d+ was already in bronze\. Nothing new opens up\.$/),
  ).toBeVisible();
  // One candle went out before this break; it stays out rather than guttering again.
  await expect(moment.locator('[data-candle="out"]')).toHaveCount(1);
});

test("the keyboard lands on the way back and returns focus to the trigger", async ({ page }) => {
  const trigger = show(page, "An hour, one candle");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const back = page.getByRole("button", { name: "Back to the pipeline" });
  await expect(back).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alertdialog")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the candle goes out in one calm fade, with no gutter", async ({ page }) => {
    await show(page, "A boss hour, two candles").click();
    const flame = page.locator('[data-candle="guttering"] > span').first();
    await expect(flame).toBeAttached();
    const animation = await flame.evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(animation).toEqual({ name: "candle-fade-out", duration: "0.22s" });
  });
});

test("screenshots every moment at the three review widths", async ({ page }, testInfo) => {
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const [id, title] of [
      ["hour", "An hour, one candle"],
      ["boss", "A boss hour, two candles"],
      ["error", "A model fails on a hidden batch"],
      ["visible", "Wrong on data already in bronze"],
    ] as const) {
      await show(page, title).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`candle-lost-${id}-${String(width)}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toBeHidden();
    }
  }
});
