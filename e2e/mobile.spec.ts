import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

// A death with a valid query, as `tombstoneQuery` builds it for the Act I boss.
const TOMBSTONE =
  "/tombstone?seed=raven-pumpkin-13&character=intern&hour=possessed-feed&at=19%3A45";

const PAGES = [
  { name: "landing", path: "/", heading: "Haunted Lakehouse" },
  { name: "crypt", path: "/crypt", heading: "The Crypt" },
  { name: "codex", path: "/crypt/codex", heading: /Codex/ },
  { name: "codex-written", path: "/dev/codex?state=all", heading: /Codex/ },
  { name: "graveyard", path: "/crypt/graveyard", heading: /Graveyard/ },
  { name: "ledger", path: "/crypt/ledger", heading: /Ledger/ },
  { name: "characters", path: "/crypt/characters", heading: /Who takes the night/ },
  { name: "daily", path: "/crypt/daily", heading: /haunt/i },
  { name: "run-new", path: "/run/new", heading: /Who takes the night/ },
  { name: "tombstone", path: TOMBSTONE, heading: "A night in Hollow Creek ended here." },
  { name: "story", path: "/dev/story", heading: "Story panel" },
  { name: "death", path: "/dev/death", heading: "Death" },
  { name: "ending", path: "/dev/endings", heading: "Endings" },
] as const;

// The galleries' own fixture pickers are development chrome, not what a player taps.
const DEV_CHROME =
  'nav[aria-label="Fixtures"], nav[aria-label="Specimen states"], [role="group"][aria-label="Deaths"]';

async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

/** How far the page reaches past the viewport's right edge, in CSS pixels. */
function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/** Every visible control smaller than a fingertip, as "name WxH". */
function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate((chrome) => {
    const controls = document.querySelectorAll<HTMLElement>(
      "a[href], button, select, textarea, input:not([type=hidden]), summary, [role=button]",
    );
    const small: string[] = [];
    for (const control of controls) {
      if (control.closest(chrome)) continue;
      const box = control.getBoundingClientRect();
      // Visually hidden inputs (a radio inside its card) are tapped through their label.
      if (box.width <= 1 || box.height <= 1) continue;
      if (getComputedStyle(control).visibility === "hidden") continue;
      if (box.width < 44 || box.height < 44) {
        const name = control.getAttribute("aria-label") ?? control.textContent;
        small.push(
          `${name.trim()} ${String(Math.round(box.width))}x${String(Math.round(box.height))}`,
        );
      }
    }
    return small;
  }, DEV_CHROME);
}

for (const width of [360, 390] as const) {
  test.describe(`a ${String(width)}px phone`, () => {
    test.use({ viewport: { width, height: 800 }, hasTouch: true });

    for (const { name, path, heading } of PAGES) {
      test(`${name} fits the width and every control takes a thumb`, async ({ page }) => {
        const errors = collectConsoleErrors(page);
        await open(page, path, heading);
        expect(await horizontalOverflow(page)).toBe(0);
        expect(await smallTargets(page)).toEqual([]);
        expect(errors).toEqual([]);
      });
    }

    test("the run screen fits the width and its controls take a thumb", async ({ page }) => {
      await open(page, "/dev/run", "The night won’t fit on this screen.");
      expect(await horizontalOverflow(page)).toBe(0);
      expect(await smallTargets(page)).toEqual([]);
    });
  });
}

test.describe("the run screen on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("names the waiting hour and offers the Crypt", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await open(page, "/dev/run", "The night won’t fit on this screen.");
    await expect(page.getByTestId("run-layout")).toBeHidden();
    await expect(page.getByRole("separator")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByText("Porch Lights, 6:00pm", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Nobody reads a pipeline through a keyhole/)).toBeVisible();

    await page.getByRole("link", { name: "Visit the Crypt" }).click();
    await expect(page).toHaveURL(/\/crypt$/);
    await expect(page.getByRole("heading", { level: 1, name: "The Crypt" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("hands the link to the share sheet where there is one", async ({ page }) => {
    await page.addInitScript(() => {
      const sent: ShareData[] = [];
      Object.assign(window, { sent });
      Object.defineProperty(navigator, "share", {
        value: (data: ShareData) => {
          sent.push(data);
          return Promise.resolve();
        },
      });
    });
    await open(page, "/dev/run", "The night won’t fit on this screen.");
    await page.getByRole("button", { name: "Save the link for later" }).click();
    await expect(page.getByRole("status")).toHaveText("Sent. The night will be where you left it.");
    const sent = await page.evaluate(() => (window as unknown as { sent: ShareData[] }).sent);
    expect(sent).toEqual([
      {
        title: "Haunted Lakehouse",
        text: "Porch Lights, 6:00pm is waiting in Hollow Creek.",
        url: page.url(),
      },
    ]);
  });

  test("copies the link where there is no share sheet", async ({ page }) => {
    await page.addInitScript(() => {
      const copied: string[] = [];
      Object.assign(window, { copied });
      Object.defineProperty(navigator, "share", { value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: (text: string) => {
            copied.push(text);
            return Promise.resolve();
          },
        },
      });
    });
    await open(page, "/dev/run", "The night won’t fit on this screen.");
    // The keyboard reaches the save button in reading order and presses it.
    const save = page.getByRole("button", { name: "Save the link for later" });
    await save.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(
      "Link copied. Open it on a laptop and the night picks up here.",
    );
    const copied = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
    expect(copied).toEqual([page.url()]);
  });

  test("shows the link to copy by hand when the clipboard refuses", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });
    await open(page, "/dev/run", "The night won’t fit on this screen.");
    await page.getByRole("button", { name: "Save the link for later" }).click();
    await expect(page.getByRole("status")).toContainText(page.url());
  });
});

test.describe("the run screen on a landscape phone", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test("keeps the message and both actions on the first screen", async ({ page }) => {
    await open(page, "/dev/run", "The night won’t fit on this screen.");
    expect(await horizontalOverflow(page)).toBe(0);
    for (const action of [
      page.getByRole("button", { name: "Save the link for later" }),
      page.getByRole("link", { name: "Visit the Crypt" }),
    ]) {
      await expect(action).toBeInViewport({ ratio: 1 });
    }
  });
});

test("screenshots each page at 375 and 768", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  for (const width of [375, 768] as const) {
    const context = await browser.newContext({
      viewport: { width, height: width === 375 ? 812 : 1024 },
      hasTouch: true,
    });
    const page = await context.newPage();
    for (const { name, path, heading } of [
      ...PAGES,
      { name: "run", path: "/dev/run", heading: "The night won’t fit on this screen." },
    ]) {
      await open(page, path, heading);
      // Moments fade in; the picture is of where they settle.
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        ),
      );
      await page.screenshot({
        path: testInfo.outputPath(`mobile-${name}-${String(width)}.png`),
        fullPage: true,
      });
    }
    await context.close();
  }
});
