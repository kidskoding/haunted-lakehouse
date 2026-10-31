import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/bottom-bar");
  await expect(page.getByRole("heading", { level: 1, name: "Bottom bar" })).toBeVisible();
});

/**
 * Picks a specimen by keyboard, so the next Tab lands on the bar's first control with a
 * visible focus, which is what opens a tooltip.
 */
async function choose(page: Page, title: string) {
  const specimen = page.getByRole("button", { name: title, exact: true });
  await specimen.focus();
  await page.keyboard.press("Enter");
  await expect(specimen).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "No relics", exact: true }).focus();
}

const relic = (page: Page, name: string) =>
  page.getByRole("group", { name: "Relics" }).getByRole("button", { name, exact: true });
const bar = (page: Page) => page.getByRole("group", { name: "Relics and run" });
const lastAction = (page: Page) => page.getByText(/^Last action:/);

test("the gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(relic(page, "Wren's Lantern")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a relic's tooltip opens on keyboard focus with its name, effect and flavor", async ({
  page,
}) => {
  await choose(page, "Open hour");
  await page.keyboard.press("Tab");
  await expect(relic(page, "Wren's Lantern")).toBeFocused();
  const tooltip = page.getByRole("tooltip").filter({ hasText: "Wren's Lantern" });
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Shows the schema history of one feed.");
  await expect(tooltip).toContainText("Hold it up to a feed");

  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await expect(relic(page, "Wren's Lantern")).toBeFocused();
});

for (const { name, pick, confirm, logged } of [
  {
    name: "Wren's Lantern",
    pick: "bronze.sensor_pings",
    confirm: "Hold up the lantern",
    logged: "Used Wren's Lantern on bronze.sensor_pings.",
  },
  {
    name: "The Raven's Feather",
    pick: "Batch 5",
    confirm: "Read the batch",
    logged: "Used The Raven's Feather on batch 5.",
  },
  {
    name: "The Hourglass",
    pick: "gold.silent_houses",
    confirm: "Turn the hourglass",
    logged: "Used The Hourglass on gold.silent_houses.",
  },
  { name: "The Black Cat", pick: null, confirm: "Skip the hour", logged: "Used The Black Cat." },
  { name: "Spare Candle", pick: null, confirm: "Light it", logged: "Used Spare Candle." },
] as const) {
  test(`${name} asks for ${pick ? "a target" : "a yes"} before it is used`, async ({ page }) => {
    await relic(page, name).click();
    const dialog = page.getByRole("dialog", { name });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Not yet" })).toBeFocused();
    const radios = dialog.getByRole("radio");
    if (pick) {
      await expect(radios.first()).toBeChecked();
      await dialog.getByRole("radio", { name: new RegExp(pick) }).check();
    } else {
      await expect(radios).toHaveCount(0);
    }
    await dialog.getByRole("button", { name: confirm }).click();
    await expect(dialog).toBeHidden();
    await expect(lastAction(page)).toHaveText(`Last action: ${logged}`);
  });
}

test("Not yet closes the relic dialog without using it and returns focus", async ({ page }) => {
  await relic(page, "The Hourglass").click();
  const dialog = page.getByRole("dialog", { name: "The Hourglass" });
  await expect(dialog.getByRole("group", { name: "Which table, at 7:00pm?" })).toBeVisible();
  await dialog.getByRole("button", { name: "Not yet" }).click();
  await expect(dialog).toBeHidden();
  await expect(relic(page, "The Hourglass")).toBeFocused();
  await expect(lastAction(page)).toHaveText("Last action: Nothing yet.");
});

test("disabled relics stay focusable, say why, and ignore activation", async ({ page }) => {
  const cases = [
    { specimen: "Curse of Darkness", name: "Wren's Lantern", reason: /Curse of Darkness/ },
    { specimen: "Boss hour", name: "The Black Cat", reason: /won't cross a boss/ },
    { specimen: "Spent relic", name: "The Hourglass", reason: /Already used/ },
    { specimen: "Between hours", name: "The Raven's Feather", reason: /only while an hour/ },
  ];
  for (const { specimen, name, reason } of cases) {
    await choose(page, specimen);
    const button = relic(page, name);
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription(reason);
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await choose(page, "Boss hour");
  await expect(relic(page, "The Hourglass")).not.toHaveAttribute("aria-disabled", "true");
});

test("Run the night confirms the stakes first", async ({ page }) => {
  const run = page.getByRole("button", { name: "Run the night" });
  await run.click();
  const dialog = page.getByRole("dialog", { name: "Run the night?" });
  await expect(dialog).toContainText("If any checkpoint breaks, 1 candle goes out.");
  await expect(dialog).toContainText("You hold 3 candles. 1 candle at stake.");
  await expect(dialog.getByRole("button", { name: "Keep working" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(lastAction(page)).toHaveText("Last action: Nothing yet.");

  await run.click();
  await dialog.getByRole("button", { name: "Run the night" }).click();
  await expect(lastAction(page)).toHaveText("Last action: The night is running.");
});

test("a boss costs 2 candles, and the last candle interrupts", async ({ page }) => {
  await choose(page, "Boss hour");
  await page.getByRole("button", { name: "Run the night" }).click();
  await expect(page.getByRole("dialog", { name: "Run the night?" })).toContainText(
    "This is a boss hour. If any checkpoint breaks, 2 candles go out.",
  );
  await page.keyboard.press("Escape");

  await choose(page, "Last candle");
  await page.getByRole("button", { name: "Run the night" }).click();
  const alert = page.getByRole("alertdialog", { name: "Run the night?" });
  await expect(alert).toContainText("This is your last candle. A break ends the run.");
});

test("the editor's chords preview and ask to run from anywhere", async ({ page }) => {
  const preview = bar(page).getByRole("button", { name: "Preview" });
  await expect(preview).toHaveAttribute("aria-keyshortcuts", "Control+Enter");
  await expect(page.getByRole("button", { name: "Run the night" })).toHaveAttribute(
    "aria-keyshortcuts",
    "Control+Shift+Enter",
  );

  await page.getByRole("heading", { level: 1 }).click();
  await page.keyboard.press("Control+Enter");
  await expect(lastAction(page)).toHaveText("Last action: Preview started.");
  await page.keyboard.press("Control+Shift+Enter");
  await expect(page.getByRole("dialog", { name: "Run the night?" })).toBeVisible();
  // While the confirm is open, the chord does not stack a second request.
  await page.keyboard.press("Control+Enter");
  await expect(lastAction(page)).toHaveText("Last action: Preview started.");
});

test("run buttons say why they can't act, and show work in flight", async ({ page }) => {
  const preview = bar(page).getByRole("button", { name: /^Preview/ });
  const run = bar(page).getByRole("button", { name: /^Run the night/ });

  await choose(page, "Engine warming");
  await expect(preview).toHaveAttribute("aria-disabled", "true");
  await expect(preview).toHaveAccessibleDescription(/still warming up/);
  await expect(run).toHaveAccessibleDescription(/still warming up/);
  await page.keyboard.press("Control+Enter");
  await expect(lastAction(page)).toHaveText("Last action: Nothing yet.");

  await choose(page, "Compile error");
  await expect(run).toHaveAttribute("aria-disabled", "true");
  await expect(run).toHaveAccessibleDescription("silver_lights has an error. Fix it first.");
  // aria-disabled reads as not enabled to Playwright, so force the click past its check.
  await run.click({ force: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await choose(page, "Previewing");
  await expect(preview).toHaveAttribute("aria-busy", "true");
  await expect(run).toHaveAccessibleDescription(/preview to finish/);

  await choose(page, "Running");
  await expect(run).toHaveAttribute("aria-busy", "true");
  await expect(preview).toHaveAccessibleDescription(/night is running/);
});

/** Waits out the dialog's entrance fade, so the screenshot shows it at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

test("screenshots the bar at the three review widths", async ({ page }, testInfo) => {
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 900 });
    await choose(page, "Open hour");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tooltip").filter({ hasText: "Wren's Lantern" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`bottom-bar-${String(width)}.png`) });

    await choose(page, "Curse of Darkness");
    await page.keyboard.press("Tab");
    await page.screenshot({
      path: testInfo.outputPath(`bottom-bar-darkness-${String(width)}.png`),
    });

    await choose(page, "Boss hour");
    await page.getByRole("button", { name: "Run the night" }).click();
    await expect(page.getByRole("dialog", { name: "Run the night?" })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath(`bottom-bar-confirm-${String(width)}.png`) });
    await page.keyboard.press("Escape");

    await choose(page, "Open hour");
    await relic(page, "The Raven's Feather").click();
    await expect(page.getByRole("dialog", { name: "The Raven's Feather" })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: testInfo.outputPath(`bottom-bar-picker-${String(width)}.png`) });
    await page.keyboard.press("Escape");
  }
});
