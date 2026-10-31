import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test("the scene shell mounts a running canvas without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/scene");

  const scene = page.locator("[data-scene-state]");
  await expect(scene).toHaveAttribute("data-scene-state", "running");
  await expect(scene.locator("canvas")).toHaveCount(1);
  await expect(scene.locator("canvas")).toBeVisible();
  await expect(page.getByText("A candle burns beside the night clock.")).toBeAttached();

  await page.getByRole("button", { name: "Last candle (gutter)" }).click();
  await expect(page.getByText("The last candle is guttering.")).toBeAttached();
  await expect(scene).toHaveAttribute("data-scene-state", "running");

  expect(errors).toEqual([]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("draws a still frame and never starts the ticker", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/dev/scene");

    const scene = page.locator("[data-scene-state]");
    await expect(scene).toHaveAttribute("data-scene-state", "static");
    await expect(scene.locator("canvas")).toHaveCount(1);
    // Give a would-be ticker time to start; the state must hold.
    await page.waitForTimeout(500);
    await expect(scene).toHaveAttribute("data-scene-state", "static");

    expect(errors).toEqual([]);
  });

  test("starts animating once the player turns reduced motion off", async ({ page }) => {
    await page.goto("/dev/scene");
    const scene = page.locator("[data-scene-state]");
    await expect(scene).toHaveAttribute("data-scene-state", "static");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(scene).toHaveAttribute("data-scene-state", "running");
  });
});
