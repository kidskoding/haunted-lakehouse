import { expect, test, type Page } from "@playwright/test";

/**
 * Collects page errors, console errors, and failed requests. The site has no favicon yet,
 * so the browser's automatic favicon request is the one expected miss.
 */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    // Failed loads are reported with their URL by the response listener below.
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.pathname !== "/favicon.ico") {
      errors.push(`${String(response.status())} ${url.pathname}`);
    }
  });
  return errors;
}

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
