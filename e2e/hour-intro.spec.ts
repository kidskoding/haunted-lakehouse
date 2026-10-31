import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const intro = (page: Page) => page.getByRole("dialog");
const fog = (page: Page) => page.locator("[data-fog] > div");

/** Waits out the moment's arrival, so checks and screenshots see it at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // The top bar's candles flicker for as long as they burn.
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  );
}

test("each curse names itself and what it changes, in fog, and Enter begins the hour", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  for (const [id, name, effect] of [
    ["possession", "Curse of Possession", "A feed's shape will change"],
    ["fog", "Curse of the Fog", "withholds the symptom numbers"],
    ["short-memory", "Curse of Short Memory", "only the latest batch"],
    ["darkness", "Curse of Darkness", "Relics can't be used"],
  ] as const) {
    await page.goto(`/dev/intros?fixture=${id}`);
    await expect(intro(page)).toHaveAccessibleName(name);
    await expect(intro(page)).toContainText(effect);
    await expect(fog(page)).toHaveCount(4);
    await expect(intro(page)).not.toContainText("candles");
    await expect(page.getByRole("button", { name: /Begin the hour/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(intro(page)).toHaveCount(0);
    await expect(page.getByText("The hour is open.")).toBeVisible();
    await expect(page.getByText(/problem, in a character/)).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("the next relic drop improves only when the engine says so", async ({ page }) => {
  await page.goto("/dev/intros?fixture=fog");
  await expect(intro(page)).toContainText("one more relic");
  await page.goto("/dev/intros?fixture=short-memory");
  await expect(intro(page)).toContainText("one more relic");
  // Old Wren is never offered relics, so a curse can't add one.
  await page.goto("/dev/intros?fixture=darkness");
  await expect(intro(page)).not.toContainText("relic waits");
});

test("Enter begins the hour even when focus has left the button, and only once", async ({
  page,
}) => {
  await page.goto("/dev/intros?fixture=boss-1");
  await page.locator("h1").click();
  await page.keyboard.press("Enter");
  await expect(intro(page)).toHaveCount(0);
  await expect(page.getByText("The hour is open.")).toBeVisible();
  // The run screen is back in reach once the intro has gone.
  await page.getByRole("button", { name: "Play it again" }).click();
  await expect(intro(page)).toBeVisible();
  await page.getByRole("button", { name: /Face the hour/ }).click();
  await expect(intro(page)).toHaveCount(0);
});

test("the run screen behind the intro is out of reach", async ({ page }) => {
  await page.goto("/dev/intros?fixture=fog");
  await expect(page.locator("[data-frame] > [inert]")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /Copy the seed|Seed/ })).not.toBeFocused();
});

test("the bosses dim the frame and say a failure costs two candles", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  for (const [id, title, meta, tier] of [
    ["boss-1", "The Possessed Feed", "Act I, Dusk", 2],
    ["boss-2", "The Graveyard Shift", "Act II, Night", 4],
    ["boss-3", "The Séance", "Act III, The Witching Hour", 5],
  ] as const) {
    await page.goto(`/dev/intros?fixture=${id}`);
    await expect(intro(page)).toHaveAccessibleName(title);
    await expect(intro(page)).toContainText(meta);
    await expect(
      intro(page).getByRole("img", { name: `Difficulty ${String(tier)} of 5` }),
    ).toBeVisible();
    await expect(intro(page)).toHaveAccessibleDescription(/takes two candles, not one/);
    await expect(fog(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Face the hour/ })).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("a cursed boss carries both: the dim, the title, the fog and the curse", async ({ page }) => {
  await page.goto("/dev/intros?fixture=boss-1-fog");
  await expect(intro(page)).toHaveAccessibleName("The Possessed Feed");
  await expect(
    intro(page).getByRole("heading", { name: "Curse of the Fog", level: 3 }),
  ).toBeVisible();
  await expect(fog(page)).toHaveCount(4);
  await expect(intro(page)).toContainText("two candles");
  await expect(intro(page)).toContainText("one more relic");
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the fog creeps in from the edges and the boss title rises", async ({ page }) => {
    await page.goto("/dev/intros?fixture=boss-1-fog");
    await expect(fog(page).first()).toHaveCSS("animation-name", "fog-creep");
    await expect(fog(page).first()).toHaveCSS("animation-duration", "1.6s");
    await expect(intro(page).locator(".title-rise").first()).toHaveCSS(
      "animation-name",
      "title-rise",
    );
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the fog is a still scrim at its final opacity, with no drift", async ({ page }) => {
    await page.goto("/dev/intros?fixture=fog");
    const bank = fog(page).first();
    await expect(bank).toHaveCSS("animation-name", "none");
    await expect(bank).toHaveCSS("opacity", "0.9");
    await expect(bank).toHaveCSS("translate", "none");
    await page.goto("/dev/intros?fixture=boss-1");
    const title = intro(page).locator(".title-rise").first();
    await expect(title).toHaveCSS("animation-name", "death-fade");
    await expect(title).toHaveCSS("animation-duration", "0.22s");
  });
});

test("screenshots every intro at the three review widths", async ({ page }, testInfo) => {
  // Eight moments at three widths, each played out to rest.
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 1000 });
    for (const id of [
      "possession",
      "fog",
      "short-memory",
      "darkness",
      "boss-1",
      "boss-1-fog",
      "boss-2",
      "boss-3",
    ]) {
      await page.goto(`/dev/intros?fixture=${id}`);
      await expect(intro(page)).toBeVisible();
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await page.locator("[data-frame]").screenshot({
        path: testInfo.outputPath(`intro-${id}-${String(width)}.png`),
      });
    }
  }
});
