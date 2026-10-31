import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

/** Waits out each step's arrival, so a screenshot shows it at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

const moment = (page: Page, title: string) => page.getByRole("region", { name: title });

/** Opens a fixture and waits for its title to take the focus, which proves it has hydrated. */
async function open(page: Page, fixture: string, title: string) {
  await page.goto(`/dev/endings?fixture=${fixture}`);
  await expect(moment(page, title).getByRole("heading", { name: title, level: 2 })).toBeFocused();
  return moment(page, title);
}

test("Dusk the first time: the scene, then Act II opens, by keyboard alone", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  const dusk = await open(page, "dusk-first", "Dusk");
  await expect(dusk.getByText("There isn't a night shift. There's you.")).toBeVisible();
  // The reveal waits for the scene to be read.
  await expect(dusk.getByText("Act II: Night is open.")).toHaveCount(0);

  await page.keyboard.press("Tab");
  await expect(dusk.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.keyboard.press("Enter");

  const reveal = dusk.getByRole("heading", { name: "Act II: Night is open.", level: 3 });
  await expect(reveal).toBeFocused();
  await expect(dusk.getByText("Your next run goes on past 7:30pm.")).toBeVisible();
  const unlocked = dusk.getByRole("list", { name: "Characters unlocked" });
  await expect(unlocked.getByRole("listitem")).toHaveText([
    "The Night Clerk is unlocked.3 candles. Picks from three relics after each hour.",
  ]);

  await page.keyboard.press("Tab");
  const crypt = dusk.getByRole("link", { name: "Continue to the Crypt" });
  await expect(crypt).toBeFocused();
  await expect(crypt).toHaveAttribute("href", "/crypt");
  expect(errors).toEqual([]);
});

test("Dusk again goes straight to the Crypt, with nothing revealed", async ({ page }) => {
  const dusk = await open(page, "dusk-repeat", "Dusk");
  await expect(dusk.getByText("Come back tomorrow night.", { exact: false })).toBeVisible();
  await expect(dusk.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(dusk.getByRole("link", { name: "Continue to the Crypt" })).toHaveAttribute(
    "href",
    "/crypt",
  );
});

test("Night opens Act III and the Purist", async ({ page }) => {
  const night = await open(page, "night", "Night");
  await expect(night.getByText("Kids call it the Hollow.", { exact: false })).toBeVisible();
  await night.getByRole("button", { name: "Continue" }).click();
  await expect(
    night.getByRole("heading", { name: "Act III: The Witching Hour is open." }),
  ).toBeFocused();
  await expect(night.getByText("Your next run goes on past 10:30pm.")).toBeVisible();
  await expect(night.getByText("The Purist is unlocked.")).toBeVisible();
});

test("the Witching Hour counts the pages and opens nothing", async ({ page }) => {
  const final = await open(page, "witching-hour", "The Witching Hour");
  await expect(
    final.getByText("Three of seven. The rest are still out there.", { exact: false }),
  ).toBeVisible();
  await expect(final.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(final.getByRole("link", { name: "Continue to the Crypt" })).toBeVisible();
});

test("Kept writes tonight's line, then unlocks Old Wren", async ({ page }) => {
  const kept = await open(page, "kept", "Kept");
  await expect(kept.getByText("Kept by the Purist.", { exact: false })).toBeVisible();
  await kept.getByRole("button", { name: "Continue" }).click();
  await expect(kept.getByRole("heading", { name: "Old Wren is unlocked." })).toBeFocused();
  await expect(kept.getByText("1 candle. No relics, ever.")).toBeVisible();
  // No act to announce, so the row doesn't repeat her name.
  await expect(kept.getByText("Old Wren is unlocked.")).toHaveCount(1);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the scene and the reveal are simply there", async ({ page }) => {
    await open(page, "dusk-first", "Dusk");
    const turn = page.locator(".story-reveal").first();
    await expect(turn).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: "Continue" }).click();
    const reveal = page.locator(".story-reveal").first();
    await expect(reveal).toHaveCSS("animation-name", "none");
    await expect(reveal).toHaveCSS("opacity", "1");
  });
});

test("screenshots every ending at the three review widths", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [fixture, title] of [
      ["dusk-first", "Dusk"],
      ["dusk-repeat", "Dusk"],
      ["night", "Night"],
      ["witching-hour", "The Witching Hour"],
      ["kept", "Kept"],
    ] as const) {
      await open(page, fixture, title);
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`ending-${fixture}-scene-${String(width)}.png`),
        fullPage: true,
      });
      const next = page.getByRole("button", { name: "Continue", exact: true });
      if ((await next.count()) === 0) continue;
      await next.click();
      await settle(page);
      await page.screenshot({
        path: testInfo.outputPath(`ending-${fixture}-reveal-${String(width)}.png`),
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
