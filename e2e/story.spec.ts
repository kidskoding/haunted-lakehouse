import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/story");
  await expect(page.getByRole("heading", { level: 1, name: "Story panel" })).toBeVisible();
});

test("the gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(page.getByRole("region", { name: "Porch Lights" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("every turn names its speaker for screen readers", async ({ page }) => {
  const intro = page.getByRole("region", { name: "Porch Lights" });
  // The accessibility tree, not the text: monograms are hidden from it, names are not.
  await expect(intro.getByRole("list").first()).toMatchAriaSnapshot(`
    - list:
      - listitem:
        - paragraph: The Mayor
        - paragraph: /^Welcome aboard, new hire\\./
      - listitem:
        - paragraph: Wren
        - paragraph: /^Every bulb in town/
  `);

  // The narrator has no monogram, but is still named aloud.
  const dusk = page.getByRole("region", { name: "Dusk" });
  await expect(dusk.getByRole("listitem").first()).toMatchAriaSnapshot(`
    - listitem:
      - paragraph: Narrator
      - paragraph: /^All over town/
  `);
  await expect(dusk.getByText("Moribund Party Supply", { exact: true })).toBeVisible();
});

test("values, fog, and code read as their words", async ({ page }) => {
  const dusk = page.getByRole("region", { name: "Dusk" });
  await expect(dusk.locator("[data-segment=fog]")).toHaveText("a number lost in the fog");

  const fogged = page.getByRole("region", { name: "The Thirteenth Door" }).first();
  await expect(fogged).toContainText("The scanners logged every knock before seven.");

  const tips = page.getByRole("complementary", { name: "First-night tips" });
  await expect(tips.locator("code", { hasText: "bronze.porch_lights" })).toBeVisible();
  const value = page.getByRole("region", { name: "Porch Lights" }).locator("[data-segment=value]");
  await expect(value.first()).toHaveCSS("font-variant-numeric", "lining-nums tabular-nums");
});

test("an empty story says so calmly", async ({ page }) => {
  await expect(page.getByRole("region", { name: "Story", exact: true })).toContainText(
    "Nobody in Hollow Creek has asked for anything yet.",
  );
});

test("the story scrolls inside its panel from the keyboard", async ({ page }) => {
  const body = page.getByRole("region", { name: "Porch Lights" }).locator("[tabindex='0']");
  await body.focus();
  await expect(body).toBeFocused();
  const scrolls = await body.evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(scrolls).toBe(true);
  await page.keyboard.press("End");
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("turns appear at once, with no reveal animation", async ({ page }) => {
    const turn = page.getByRole("region", { name: "Porch Lights" }).getByRole("listitem").first();
    await expect(turn).toHaveCSS("animation-name", "none");
    await expect(turn).toHaveCSS("opacity", "1");
  });
});

test("with full motion, turns reveal and settle visible", async ({ page }) => {
  const turn = page.getByRole("region", { name: "Porch Lights" }).getByRole("listitem").first();
  await expect(turn).toHaveCSS("animation-name", "story-reveal");
  await expect(turn).toHaveCSS("opacity", "1");
});

test.describe("art-direction widths", () => {
  for (const width of [1280, 1440, 1920] as const) {
    test(`renders the gallery at ${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole("region", { name: "Porch Lights" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
    });
  }
});
