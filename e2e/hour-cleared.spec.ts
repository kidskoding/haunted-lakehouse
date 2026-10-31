import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const stepHeading = (page: Page) => page.locator("h3:focus");

/** Waits out each step's arrival, so a screenshot shows it at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

test("walks the beat, the autopsy, then two relics, by keyboard alone", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/cleared?fixture=porch");
  const moment = page.getByRole("region", { name: "Porch Lights, cleared" });
  await expect(moment).toBeVisible();

  await expect(stepHeading(page)).toHaveText("The town");
  await expect(moment.locator('[aria-current="step"]')).toHaveText("The town");
  // The technique is named only on the autopsy card.
  await expect(moment.getByText("Event logs are not state")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "What really happened" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(stepHeading(page)).toHaveText("Event logs are not state");
  await expect(moment.getByRole("heading", { name: "The idea" })).toBeVisible();
  await expect(moment.getByText("event sourcing")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Choose a relic" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(stepHeading(page)).toHaveText("Take one of two");

  const group = moment.getByRole("radiogroup", { name: "Take one of two" });
  await expect(group.getByRole("radio")).toHaveCount(2);
  const feather = group.getByRole("radio", { name: /The Raven's Feather/ });
  const hourglass = group.getByRole("radio", { name: /The Hourglass/ });
  await expect(feather).toBeChecked();
  await expect(hourglass).toHaveAccessibleDescription(/expected row count/);

  await page.keyboard.press("Tab");
  await expect(feather).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(hourglass).toBeChecked();
  await expect(page.getByRole("button", { name: "Take The Hourglass" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Took The Hourglass.");
  expect(errors).toEqual([]);
});

test("a cursed hour's offer holds one more relic, and says why", async ({ page }) => {
  await page.goto("/dev/cleared?fixture=door-darkness");
  await page.getByRole("button", { name: "What really happened" }).click();
  await page.getByRole("button", { name: "Choose a relic" }).click();
  const group = page.getByRole("radiogroup", { name: "Take one of three" });
  await expect(group.getByRole("radio")).toHaveCount(3);
  await expect(group).toHaveAccessibleDescription(/Curse of Darkness/);
  await page.getByRole("button", { name: "Take nothing" }).click();
  await expect(page.getByRole("status")).toHaveText("Took nothing. On into the next hour.");
});

test("the Night Clerk chooses among three", async ({ page }) => {
  await page.goto("/dev/cleared?fixture=clerk");
  await page.getByRole("button", { name: "What really happened" }).click();
  await page.getByRole("button", { name: "Choose a relic" }).click();
  const group = page.getByRole("radiogroup", { name: "Take one of three" });
  await group.getByText("The Black Cat").click();
  await page.getByRole("button", { name: "Take The Black Cat" }).click();
  await expect(page.getByRole("status")).toHaveText("Took The Black Cat.");
});

test("the boss clear shows its autopsy and offer", async ({ page }) => {
  await page.goto("/dev/cleared?fixture=feed-boss");
  await expect(page.getByRole("region", { name: "The Possessed Feed, cleared" })).toBeVisible();
  await page.getByRole("button", { name: "What really happened" }).click();
  await expect(stepHeading(page)).not.toHaveText("");
  await page.getByRole("button", { name: "Choose a relic" }).click();
  await expect(page.getByRole("radio")).toHaveCount(2);
});

test("a found page shows in the beat, and Old Wren goes on without relics", async ({ page }) => {
  await page.goto("/dev/cleared?fixture=page");
  const ledger = page.getByRole("complementary", { name: "Ledger page I" });
  await expect(ledger).toContainText("1891");
  await expect(ledger).toContainText("Kept by Eliza Wren.");
  await page.getByRole("button", { name: "What really happened" }).click();
  await expect(page.getByRole("button", { name: "Choose a relic" })).toHaveCount(0);
  await page.getByRole("button", { name: "Into the next hour" }).click();
  await expect(page.getByRole("status")).toHaveText("Took nothing. On into the next hour.");
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("each step is simply there", async ({ page }) => {
    await page.goto("/dev/cleared?fixture=porch");
    const step = page.locator(".story-reveal").first();
    await expect(step).toHaveCSS("animation-name", "none");
    await expect(step).toHaveCSS("opacity", "1");
  });
});

test("screenshots every step at the three review widths", async ({ page }, testInfo) => {
  const errors = collectConsoleErrors(page);
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 1000 });
    for (const fixture of ["porch", "door-darkness", "page"] as const) {
      await page.goto(`/dev/cleared?fixture=${fixture}`);
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`cleared-${fixture}-beat-${String(width)}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "What really happened" }).click();
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`cleared-${fixture}-autopsy-${String(width)}.png`),
        fullPage: true,
      });
      const next = page.getByRole("button", { name: "Choose a relic" });
      if ((await next.count()) === 0) continue;
      await next.click();
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`cleared-${fixture}-relics-${String(width)}.png`),
        fullPage: true,
      });
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  }
  expect(errors).toEqual([]);
});
