import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const live = { name: "Live" } as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/top-bar");
  await expect(page.getByRole("heading", { level: 1, name: "Top bar" })).toBeVisible();
});

test("the gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(page.getByRole("heading", { level: 2, ...live })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the night's hours are spoken, the second 1:00am as the second time", async ({ page }) => {
  const witching = page.getByRole("region", { name: "The second 1:00am" });
  const hours = witching.getByRole("list", { name: "The night's hours" }).getByRole("listitem");
  await expect(hours).toHaveCount(10);
  await expect(hours.nth(8)).toHaveText("Hour 9, 1:00am, the second time, Act 3, now");
  await expect(hours.nth(9)).toHaveText("Hour 10, 2:00am, Act 3, boss");
  await expect(witching.getByText("again")).toBeVisible();
  await expect(witching.getByText("Act 3: The Witching Hour")).toBeAttached();
});

test("losing a candle gutters it and announces the count", async ({ page }) => {
  const section = page.getByRole("region", live);
  await expect(section.getByRole("status")).toHaveText("3 of 3 candles lit");

  await section.getByRole("button", { name: "Blow out a candle" }).click();
  await expect(section.getByRole("status")).toHaveText("2 of 3 candles lit");
  await expect(section.locator('[data-candle="guttering"]')).toHaveCount(1);
  await expect(section.locator('[data-candle="lit"]')).toHaveCount(2);
});

test("the seed copies from the keyboard and says so in a toast", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const section = page.getByRole("region", live);
  const seed = section.getByRole("button", { name: "Seed raven-pumpkin-13 (copy)" });

  await section.getByRole("button", { name: "Start the night over" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(seed).toBeFocused();
  await expect(
    page.getByRole("tooltip", { name: "Copy the seed to replay this night" }),
  ).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByText("Seed copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("raven-pumpkin-13");
});

test("the next hour moves the current marker along the track", async ({ page }) => {
  const section = page.getByRole("region", live);
  const hours = section.getByRole("list", { name: "The night's hours" }).getByRole("listitem");
  await expect(hours.nth(0)).toContainText("6:00pm, Act 1, now");

  await section.getByRole("button", { name: "Next hour" }).click();
  await expect(hours.nth(0)).toContainText("6:00pm, Act 1, passed");
  await expect(hours.nth(1)).toHaveText("Hour 2, 6:45pm, Act 1, now");
  await expect(section.getByText("6:45pm", { exact: true })).toBeVisible();
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a candle going out is one short crossfade", async ({ page }) => {
    const section = page.getByRole("region", live);
    await section.getByRole("button", { name: "Blow out a candle" }).click();
    const flame = section.locator('[data-candle="guttering"] > span').first();
    await expect(flame).toBeAttached();
    const animation = await flame.evaluate((element) => {
      const style = getComputedStyle(element);
      return { name: style.animationName, duration: style.animationDuration };
    });
    expect(animation).toEqual({ name: "candle-fade-out", duration: "0.22s" });
  });
});

test.describe("art-direction widths", () => {
  for (const width of [1280, 1440, 1920] as const) {
    test(`fits one row at ${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const bars = page.getByRole("region", { name: "The night so far" });
      await expect(bars).toHaveCount(7);
      for (const bar of await bars.all()) {
        const box = await bar.boundingBox();
        expect(box?.height).toBe(64);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});
