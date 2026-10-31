import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const TAGLINE = "A roguelike where your data pipeline has to survive Halloween night.";

test("the landing shows the title, tagline, and a live dusk scene without console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Haunted Lakehouse" })).toBeVisible();
  await expect(page.getByText(TAGLINE)).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the night" })).toBeVisible();

  const scene = page.locator("[data-scene-state]");
  await expect(scene).toHaveAttribute("data-scene-state", "running");
  await expect(scene.locator("canvas")).toHaveCount(1);

  expect(errors).toEqual([]);
});

test("the server sends the still scene and a working link before any script runs", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.locator("[data-scene-state] svg")).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveAttribute("href", "/run");
  await context.close();
});

test("the scene arriving does not move anything on the page", async ({ page }) => {
  // Hold the scene's code back, so the still drawing is measured before the canvas replaces it.
  const { promise: held, resolve: release } = Promise.withResolvers<undefined>();
  let heldRequests = 0;
  await page.route(/pixi|hollow-creek/, async (route) => {
    heldRequests += 1;
    await held;
    await route.continue();
  });

  await page.goto("/");
  const scene = page.locator("[data-scene-state]");
  await expect(scene).toHaveAttribute("data-scene-state", "loading");
  await expect(scene.locator("svg")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const boxes = async () =>
    Promise.all(
      [
        page.getByRole("heading", { level: 1 }),
        page.getByRole("link", { name: "Enter the night" }),
        scene,
      ].map((locator) => locator.boundingBox()),
    );
  const before = await boxes();

  release(undefined);
  await expect(scene).toHaveAttribute("data-scene-state", "running");
  expect(heldRequests).toBeGreaterThan(0);
  expect(await boxes()).toEqual(before);
});

test("Enter the night is the first stop for the keyboard and leads to the run", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");

  const enter = page.getByRole("link", { name: "Enter the night" });
  await page.keyboard.press("Tab");
  await expect(enter).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL("/run");
  await expect(
    page.getByRole("heading", { level: 1, name: "The night isn’t ready yet." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Hollow Creek" }).click();
  await expect(page).toHaveURL("/");

  expect(errors).toEqual([]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the dusk scene is a still frame", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    const scene = page.locator("[data-scene-state]");
    await expect(scene).toHaveAttribute("data-scene-state", "static");
    // Give a would-be ticker time to start; the state must hold.
    await page.waitForTimeout(500);
    await expect(scene).toHaveAttribute("data-scene-state", "static");

    expect(errors).toEqual([]);
  });
});

test("the page carries share metadata", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Haunted Lakehouse");
  const meta = (selector: string) => page.locator(selector).getAttribute("content");
  expect(await meta('meta[name="description"]')).toBe(TAGLINE);
  expect(await meta('meta[property="og:image"]')).toMatch(/\/opengraph-image/);
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await meta('meta[name="twitter:image"]')).toMatch(/\/twitter-image/);
});

for (const path of ["/opengraph-image", "/twitter-image"]) {
  test(`${path} is a PNG share card`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const body = await response.body();
    // PNG signature, and a real picture rather than an empty frame.
    expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(body.length).toBeGreaterThan(20_000);
  });
}
