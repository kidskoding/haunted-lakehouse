import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/death");
  await expect(page.getByRole("heading", { level: 1, name: "Death" })).toBeVisible();
});

const moment = (page: Page) => page.getByRole("region", { name: "The last candle is out." });
const stone = (page: Page) => moment(page).getByRole("group", { name: /^Tombstone of / });

async function choose(page: Page, title: string) {
  const specimen = page.getByRole("group", { name: "Deaths" }).getByRole("button", {
    name: title,
    exact: true,
  });
  await specimen.click();
  await expect(specimen).toHaveAttribute("aria-pressed", "true");
}

test("the gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(stone(page)).toBeVisible();
  await expect(page.getByRole("img", { name: /tombstone/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the stone engraves the run's facts", async ({ page }) => {
  await choose(page, "Act I boss");
  const engraved = stone(page);
  await expect(engraved).toHaveAccessibleName("Tombstone of kidskoding");
  await expect(engraved).toContainText("The Night Clerk");
  await expect(engraved).toContainText("went out at 7:45pm, Halloween 2026");
  await expect(engraved).toContainText("The Possessed Feed");
  await expect(engraved).toContainText("wraith-toffee-7");
  await expect(engraved).toContainText(
    /Couldn't read it, so threw it away\.|Called 'a dozen' a typo\./,
  );
  await expect(engraved).not.toContainText("1891");
});

test("each death engraves its own stone", async ({ page }) => {
  await choose(page, "Early death");
  await expect(stone(page)).toHaveAccessibleName("Tombstone of A New Hire");
  await expect(stone(page)).toContainText("Porch Lights");

  await choose(page, "Daily Haunt");
  await expect(stone(page)).toContainText("Had one try. Used it.");

  await choose(page, "Old Wren");
  await expect(stone(page)).toContainText("Kept it, this time.");

  await choose(page, "Act III, the Hollow named");
  await expect(stone(page)).toContainText("1891");
  await expect(page.getByText(/No card: no run can play The Séance yet/)).toBeVisible();
});

test("long names stay inside the stone", async ({ page }) => {
  await choose(page, "Long names");
  const box = await stone(page).boundingBox();
  const handle = await stone(page)
    .getByText("a-very-long-github-login-for-a-stone-39")
    .boundingBox();
  expect(box && handle && handle.x >= box.x && handle.x + handle.width <= box.x + box.width).toBe(
    true,
  );
});

test("focus lands on the death, then the three ways out follow in order", async ({ page }) => {
  await choose(page, "Act I boss");
  const title = moment(page).getByRole("heading", { name: "The last candle is out." });
  await expect(title).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(moment(page).getByRole("link", { name: "Rise again" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(moment(page).getByRole("link", { name: "Replay seed" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(moment(page).getByRole("button", { name: "Share" })).toBeFocused();
});

test("rise again starts fresh and replay seed carries the seed", async ({ page }) => {
  await choose(page, "Long names");
  await expect(moment(page).getByRole("link", { name: "Rise again" })).toHaveAttribute(
    "href",
    "/run/new",
  );
  await expect(moment(page).getByRole("link", { name: "Replay seed" })).toHaveAttribute(
    "href",
    "/run/new?seed=specter-candycorn-99",
  );
});

test("share copies the stone's link, which opens the stone with its card", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await choose(page, "Act I boss");
  await moment(page).getByRole("button", { name: "Share" }).click();
  await expect(moment(page).getByRole("status")).toHaveText(
    "Link copied. Its preview shows the stone.",
  );

  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link.startsWith(`${baseURL ?? ""}/tombstone?`)).toBe(true);

  const errors = collectConsoleErrors(page);
  await page.goto(link);
  await expect(
    page.getByRole("heading", { level: 1, name: "A night in Hollow Creek ended here." }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Tombstone of kidskoding" })).toBeVisible();
  const card = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(card).toContain("/tombstone/image?");
  const response = await page.request.get(card ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(errors).toEqual([]);
});

test("a share that can't reach the clipboard shows the link to copy by hand", async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await choose(page, "Early death");
  await moment(page).getByRole("button", { name: "Share" }).click();
  await expect(moment(page).getByRole("status")).toContainText(
    "The clipboard wouldn’t take it. Copy the link from here:",
  );
  await expect(moment(page).getByRole("status")).toContainText("/tombstone?seed=raven-pumpkin-13");
});

test("a doctored link gets no stone and no card", async ({ page }) => {
  const doctored = "seed=raven-pumpkin-13&character=intern&hour=porch-lights&at=09%3A00";
  expect((await page.request.get(`/tombstone/image?${doctored}`)).status()).toBe(400);
  expect((await page.goto(`/tombstone?${doctored}`))?.status()).toBe(404);
});

test("with full motion, the dark fades in and the stone rises after it", async ({ page }) => {
  await choose(page, "Early death");
  await expect(moment(page)).toHaveCSS("animation-name", "death-fade");
  await expect(moment(page)).toHaveCSS("animation-duration", "1.6s");
  const rising = moment(page).locator(".tomb-rise");
  await expect(rising).toHaveCSS("animation-name", "tomb-rise");
  await expect(rising).toHaveCSS("animation-delay", "1.6s");
  await expect(rising).toHaveCSS("opacity", "1", { timeout: 6000 });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the dark is a short crossfade and the stone appears in place", async ({ page }) => {
    await choose(page, "Early death");
    await expect(moment(page)).toHaveCSS("animation-duration", "0.22s");
    const rising = moment(page).locator(".tomb-rise");
    await expect(rising).toHaveCSS("animation-name", "death-fade");
    await expect(rising).toHaveCSS("animation-delay", "0s");
    await expect(rising).toHaveCSS("opacity", "1");
  });
});

test("screenshots the moment and the share page at the three review widths", async ({
  page,
}, testInfo) => {
  // Each stone rises over a few seconds; the screenshots only need where it comes to rest.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 1000 });
    for (const title of ["Act I boss", "Long names", "Act III, the Hollow named"] as const) {
      await choose(page, title);
      await expect(moment(page).locator(".tomb-rise")).toHaveCSS("opacity", "1", {
        timeout: 6000,
      });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await moment(page).screenshot({
        path: testInfo.outputPath(`death-${title.replace(/\W+/g, "-")}-${String(width)}.png`),
      });
    }
  }

  await page.goto(
    "/tombstone?seed=wraith-toffee-7&character=night_clerk&hour=possessed-feed&at=19%3A45&handle=kidskoding",
  );
  for (const width of [390, 1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath(`tombstone-page-${String(width)}.png`) });
  }
  const card = await page.request.get(
    "/tombstone/image?seed=wraith-toffee-7&character=night_clerk&hour=possessed-feed&at=19%3A45&handle=kidskoding",
  );
  await testInfo.attach("share-card", { body: await card.body(), contentType: "image/png" });
});
