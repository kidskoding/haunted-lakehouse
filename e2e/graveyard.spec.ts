import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const WIDTHS = [375, 1280, 1440, 1920] as const;

const filters = (page: Page) => page.getByRole("navigation", { name: "Filter the stones" });
const stones = (page: Page) => page.getByRole("group", { name: /^Tombstone of / });

function filterLink(page: Page, group: string, name: string) {
  const list = filters(page).getByRole("list", { name: group });
  return list.getByRole("link", { name, exact: true });
}

test("the hill shows each stone with its share page and its seed to replay", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/graveyard?state=stones");

  await expect(page.getByRole("heading", { level: 1, name: "The Graveyard" })).toBeVisible();
  await expect(stones(page)).toHaveCount(6);
  const first = stones(page).first();
  await expect(first).toContainText("kidskoding");
  await expect(first).toContainText("The Night Clerk");
  await expect(first).toContainText("went out at 8:00pm, Halloween 2026");
  await expect(stones(page).nth(1)).toContainText("A New Hire");

  const visit = page.getByRole("link", {
    name: "Visit the stone of kidskoding, The Possessed Feed",
  });
  await expect(visit).toHaveAttribute("href", /^\/tombstone\?seed=wraith-toffee-7&/);
  await expect(page.getByRole("link", { name: "Replay seed wraith-toffee-7" })).toHaveAttribute(
    "href",
    "/run/new?seed=wraith-toffee-7",
  );

  await visit.click();
  await expect(page).toHaveURL(/\/tombstone\?/);
  await expect(page.getByRole("group", { name: "Tombstone of kidskoding" })).toBeVisible();

  await page.goto("/dev/graveyard?state=stones");
  await page.getByRole("link", { name: "Replay seed wraith-toffee-7" }).click();
  await expect(page).toHaveURL("/run/new?seed=wraith-toffee-7");

  expect(errors).toEqual([]);
});

test("pages back and forth, keeping the filters", async ({ page }) => {
  await page.goto("/dev/graveyard?state=page-two");
  const more = page.getByRole("navigation", { name: "More stones" });
  await expect(more.getByRole("link", { name: "Newer stones" })).toHaveAttribute(
    "href",
    "/crypt/graveyard?character=purist",
  );
  await expect(more.getByRole("link", { name: "Older stones" })).toHaveAttribute(
    "href",
    "/crypt/graveyard?character=purist&page=3",
  );

  await page.goto("/dev/graveyard?state=stones");
  await expect(more.getByRole("link", { name: "Newer stones" })).toHaveCount(0);
});

test("every filter is a link to its own URL, and the URL picks the filter", async ({ page }) => {
  await page.goto("/crypt/graveyard");
  await expect(filterLink(page, "Who fell", "Anyone")).toHaveAttribute("aria-current", "true");

  await filterLink(page, "Who fell", "The Purist").click();
  await expect(page).toHaveURL("/crypt/graveyard?character=purist");
  await filterLink(page, "Where it broke", "The Possessed Feed").click();
  await expect(page).toHaveURL("/crypt/graveyard?character=purist&hour=possessed-feed");
  await filterLink(page, "Which nights", "Daily Haunt only").click();
  await expect(page).toHaveURL("/crypt/graveyard?character=purist&hour=possessed-feed&daily=1");

  for (const [group, name] of [
    ["Who fell", "The Purist"],
    ["Where it broke", "The Possessed Feed"],
    ["Which nights", "Daily Haunt only"],
  ] as const) {
    await expect(filterLink(page, group, name)).toHaveAttribute("aria-current", "true");
  }
  await expect(filterLink(page, "Who fell", "Anyone")).not.toHaveAttribute("aria-current");

  // Changing a filter starts over from the newest stones.
  await page.goto("/crypt/graveyard?character=purist&page=4");
  await expect(filterLink(page, "Who fell", "The Intern")).toHaveAttribute(
    "href",
    "/crypt/graveyard?character=intern",
  );
});

test("a link someone edited still opens the Graveyard, unfiltered where it was garbled", async ({
  page,
}) => {
  const response = await page.goto(
    "/crypt/graveyard?character=ghost&hour=porch-lights&daily=yes&page=99",
  );
  expect(response?.status()).toBe(200);
  await expect(filterLink(page, "Who fell", "Anyone")).toHaveAttribute("aria-current", "true");
  await expect(filterLink(page, "Where it broke", "Porch Lights")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(filterLink(page, "Which nights", "Every night")).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("filters work before any script runs", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/crypt/graveyard");
  await filterLink(page, "Who fell", "Old Wren").click();
  await expect(page).toHaveURL("/crypt/graveyard?character=old_wren");
  await expect(filterLink(page, "Who fell", "Old Wren")).toHaveAttribute("aria-current", "true");
  await context.close();
});

test("the real room reads the hill from the database", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/crypt/graveyard?hour=thirteenth-door");
  await expect(filterLink(page, "Where it broke", "The Thirteenth Door")).toHaveAttribute(
    "aria-current",
    "true",
  );
  // The test server reads a local database: the hill shows its stones, or says none match.
  await expect(
    page
      .getByRole("region", { name: "Stones" })
      .or(page.getByRole("heading", { level: 2, name: "No stone here answers to that." }))
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "The gate won't open tonight." }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an unreadable hill says so and offers the gate again", async ({ page }) => {
  await page.goto("/dev/graveyard?state=error");
  await expect(
    page.getByRole("heading", { level: 2, name: "The gate won't open tonight." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the gate again" })).toHaveAttribute(
    "href",
    "/crypt/graveyard",
  );
  await page.getByRole("link", { name: "Back to the Crypt" }).click();
  await expect(page).toHaveURL("/crypt");
});

test("the empty states point somewhere useful", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/graveyard?state=bare");
  await expect(page.getByRole("heading", { level: 2, name: "The hill is bare." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Enter the night" })).toHaveAttribute(
    "href",
    "/run/new",
  );

  await page.goto("/dev/graveyard?state=no-match");
  await expect(
    page.getByRole("heading", { level: 2, name: "No stone here answers to that." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Show every stone" })).toHaveAttribute(
    "href",
    "/crypt/graveyard",
  );
  expect(errors).toEqual([]);
});

test("a followed filter shows it is loading until the new hill arrives", async ({ page }) => {
  await page.goto("/crypt/graveyard");
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Hold the room's next render so the pending state can be seen.
  await page.route(/\/crypt\/graveyard\?.*_rsc=/, async (route) => {
    await held;
    await route.continue();
  });
  // By its address: while pending, the link's name also says it is loading.
  const purist = filters(page).locator('a[href="/crypt/graveyard?character=purist"]');
  await purist.click();
  await expect(purist.locator("[data-pending]")).toBeVisible();
  await expect(purist).toContainText("reading the stones");
  release();
  await expect(page).toHaveURL("/crypt/graveyard?character=purist");
  await expect(filterLink(page, "Who fell", "The Purist")).toHaveAttribute("aria-current", "true");
  await expect(filters(page).locator("[data-pending]")).toHaveCount(0);
});

test("the keyboard walks the room in reading order", async ({ page }) => {
  await page.goto("/dev/graveyard?state=stones");
  // Past the gallery's own state links.
  await page.getByRole("link", { name: "Back to the Crypt" }).focus();
  const order = [
    "Anyone",
    "The Intern",
    "The Night Clerk",
    "The Purist",
    "Old Wren",
    "Any hour",
    "Porch Lights",
    "The Thirteenth Door",
    "The Possessed Feed",
    "Every night",
    "Daily Haunt only",
    "Visit the stone",
    "Replay seed",
  ];
  for (const name of order) {
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveText(name);
  }
});

test("calm motion keeps every state the same", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/graveyard?state=stones");
  await expect(stones(page)).toHaveCount(6);
});

for (const width of WIDTHS) {
  test(`screenshots at ${String(width)}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const state of ["stones", "page-two", "bare", "no-match", "error"]) {
      await page.goto(`/dev/graveyard?state=${state}`);
      await expect(page.getByRole("heading", { level: 1, name: "The Graveyard" })).toBeVisible();
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(scroll).toBe(0);
      await page.screenshot({
        path: `test-results/graveyard/${state}-${String(width)}.png`,
        fullPage: true,
      });
    }
  });
}
