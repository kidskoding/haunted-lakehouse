import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const night = (page: Page) => page.locator("[data-night-state]");
const batch = (page: Page, n: number) => page.locator("[data-batch-outcome]").nth(n - 1);
const checkpoint = (page: Page, n: number) => page.locator("[data-checkpoint-outcome]").nth(n - 1);

async function choose(page: Page, title: string) {
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(night(page)).toHaveAttribute("data-night-state", "running");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/night");
  await expect(page.getByRole("heading", { level: 1, name: "Run the night" })).toBeVisible();
});

test("a surviving night plays out to the end and hands focus to Continue", async ({ page }) => {
  test.setTimeout(45_000);
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Skip/ })).toBeFocused();
  await expect(batch(page, 1)).toHaveAttribute("data-batch-outcome", "landed");
  await expect(night(page)).toHaveAttribute("data-night-state", "running");

  await expect(night(page)).toHaveAttribute("data-night-state", "survived", { timeout: 20_000 });
  await expect(page.locator('[data-batch-outcome="landed"]')).toHaveCount(8);
  await expect(page.locator('[data-checkpoint-outcome="passed"]')).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: "The night held" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await expect(page.getByText("Last action: The night held.")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.getByText("Last action: Continue pressed.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Escape skips a wrong answer to the cracked checkpoint and freezes there", async ({
  page,
}) => {
  await choose(page, "Wrong answer at checkpoint 2");
  await page.keyboard.press("Escape");

  await expect(night(page)).toHaveAttribute("data-night-state", "broke");
  await expect(checkpoint(page, 1)).toHaveAttribute("data-checkpoint-outcome", "passed");
  await expect(checkpoint(page, 2)).toHaveAttribute("data-checkpoint-outcome", "cracked");
  await expect(checkpoint(page, 3)).toHaveAttribute("data-checkpoint-outcome", "waiting");
  await expect(batch(page, 6)).toHaveAttribute("data-batch-outcome", "landed");
  await expect(batch(page, 7)).toHaveAttribute("data-batch-outcome", "waiting");
  await expect(
    page.getByRole("heading", { level: 2, name: "The 6:45pm checkpoint cracked" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Batch 6 is now yours to query.");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
});

test("the Skip button stops a runtime error at its hidden batch", async ({ page }) => {
  await choose(page, "Runtime error at a hidden batch");
  await page.getByRole("button", { name: /^Skip/ }).click();

  await expect(night(page)).toHaveAttribute("data-night-state", "broke");
  await expect(batch(page, 4)).toHaveAttribute("data-batch-outcome", "landed");
  await expect(batch(page, 5)).toHaveAttribute("data-batch-outcome", "broke");
  await expect(batch(page, 6)).toHaveAttribute("data-batch-outcome", "waiting");
  await expect(checkpoint(page, 2)).toHaveAttribute("data-checkpoint-outcome", "waiting");
  await expect(
    page.getByRole("heading", { level: 2, name: "The night stopped at batch 5" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "silver.porch_state failed to run on batch 5",
  );
  // Where, never why: the error's message stays out of the moment.
  await expect(page.getByText("Two rows share")).toHaveCount(0);
});

test("a replay that changed gold freezes on the replayed batch", async ({ page }) => {
  await choose(page, "Replay flinch");
  await page.keyboard.press("Escape");

  await expect(night(page)).toHaveAttribute("data-night-state", "broke");
  await expect(page.locator("[data-replay-outcome]")).toHaveAttribute(
    "data-replay-outcome",
    "flinched",
  );
  await expect(checkpoint(page, 1)).toHaveAttribute("data-checkpoint-outcome", "passed");
  await expect(checkpoint(page, 2)).toHaveAttribute("data-checkpoint-outcome", "waiting");
  await expect(batch(page, 7)).toHaveAttribute("data-batch-outcome", "waiting");
  await expect(page.getByRole("heading", { level: 2, name: "Batch 6 flinched" })).toBeVisible();
});

test("a replay that held lets the night finish", async ({ page }) => {
  await choose(page, "Witching hour survived");
  await page.keyboard.press("Escape");
  await expect(night(page)).toHaveAttribute("data-night-state", "survived");
  await expect(page.locator("[data-replay-outcome]")).toHaveAttribute(
    "data-replay-outcome",
    "held",
  );
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("steps through the night calmly with a still clock", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.reload();
    await expect(page.locator("[data-scene-state]")).toHaveAttribute("data-scene-state", "static");
    await expect(batch(page, 2)).toHaveAttribute("data-batch-outcome", "landed");
    await expect(night(page)).toHaveAttribute("data-night-state", "running");
    await page.keyboard.press("Escape");
    await expect(night(page)).toHaveAttribute("data-night-state", "survived");
    expect(errors).toEqual([]);
  });
});

test("screenshots every night at the three review widths", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  for (const title of [
    "Survived",
    "Wrong answer at checkpoint 2",
    "Runtime error at a hidden batch",
    "Replay flinch",
  ]) {
    await choose(page, title);
    await page.keyboard.press("Escape");
    await expect(night(page)).not.toHaveAttribute("data-night-state", "running");
    // Let the last landing and the summary's fade settle.
    await page.waitForTimeout(1000);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    for (const width of [1280, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: testInfo.outputPath(`night-${slug}-${String(width)}.png`),
        fullPage: true,
      });
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await choose(page, "Wrong answer at checkpoint 2");
  await expect(batch(page, 3)).toHaveAttribute("data-batch-outcome", "landed");
  await page.screenshot({ path: testInfo.outputPath("night-midway-1440.png"), fullPage: true });
});
