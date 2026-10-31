import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

/** A live specimen in the gallery, found by its caption. Pinned specimens are inert. */
function specimen(page: Page, caption: string | RegExp): Locator {
  return page.getByRole("figure", { name: caption, exact: typeof caption === "string" });
}

const toasts = (page: Page) => page.getByRole("region", { name: "Notifications" });

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/components");
  await expect(page.getByRole("heading", { level: 1, name: "Core components" })).toBeVisible();
});

test("the gallery renders every component without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  for (const name of [
    "Buttons",
    "Keyboard hints",
    "Tooltips",
    "Tabs",
    "Panels",
    "Dialogs",
    "Toasts",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test.describe("button", () => {
  test("a disabled button stays focusable, explains itself, and ignores Enter", async ({
    page,
  }) => {
    const live = specimen(page, /^Live: the disabled one/);
    const run = live.getByRole("button", { name: "Run the night" });
    await run.focus();
    await expect(run).toBeFocused();
    await expect(run).toHaveAttribute("aria-disabled", "true");
    await expect(run).toHaveAccessibleDescription("The engine is still warming up (62%).");
    await expect(live.getByRole("tooltip")).toBeVisible();

    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
    await expect(toasts(page).getByText(/./)).toHaveCount(0);
  });

  test("Enter runs a button, which reports busy until its work is done", async ({ page }) => {
    const preview = specimen(page, /^Live: the disabled one/).getByRole("button", {
      name: /^Preview/,
    });
    await expect(preview).toHaveAttribute("aria-keyshortcuts", "Control+Enter");
    await preview.focus();
    await page.keyboard.press("Enter");
    await expect(preview).toHaveAttribute("aria-busy", "true");
    await expect(preview).toHaveAccessibleName("Preview , working");
    await expect(preview).toBeFocused();

    await expect(toasts(page).getByRole("status")).toContainText("Preview ran");
    await expect(preview).not.toHaveAttribute("aria-busy");
  });
});

test.describe("kbd hint", () => {
  test("follows the platform and is spoken in words", async ({ page }) => {
    const other = specimen(page, "Windows and Linux");
    await expect(other.getByText("Ctrl+Shift+Enter", { exact: true })).toBeVisible();
    await expect(other.getByText("Control Shift Enter", { exact: true })).toBeAttached();

    const mac = specimen(page, "macOS");
    await expect(mac.getByText("⌘⇧↵", { exact: true })).toBeVisible();
    await expect(mac.getByText("Command Shift Return", { exact: true })).toBeAttached();
  });
});

test.describe("tooltip", () => {
  test("shows on keyboard focus, and Escape hides it without moving focus", async ({ page }) => {
    const header = specimen(page, /^Live: icon buttons/);
    const format = header.getByRole("button", { name: "Format SQL" });
    await format.focus();
    const tooltip = header.getByRole("tooltip").filter({ hasText: "Format SQL" });
    await expect(tooltip).toBeVisible();
    await expect(format).toHaveAccessibleDescription(/Format SQL/);

    await page.keyboard.press("Escape");
    await expect(tooltip).toBeHidden();
    await expect(format).toBeFocused();

    await page.keyboard.press("Tab");
    const close = header.getByRole("button", { name: "Close tab" });
    await expect(close).toBeFocused();
    await expect(header.getByRole("tooltip").filter({ hasText: "Close tab" })).toBeVisible();
  });

  test("shows on hover and hides when the pointer leaves", async ({ page }) => {
    const live = specimen(page, /^Live: a disabled action/);
    const tooltip = live.getByRole("tooltip");
    await expect(tooltip).toBeHidden();
    await live.getByRole("button", { name: "Use relic" }).hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText("Clear an hour to choose a relic.");

    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
  });
});

test.describe("tabs", () => {
  test("arrows select and wrap, skip disabled tabs, and Tab enters the panel", async ({ page }) => {
    const live = specimen(page, /^Live: per-model/);
    const tab = (name: string | RegExp) => live.getByRole("tab", { name });
    const first = tab(/^gold\.porch_lights/);
    const second = tab("silver.light_events");
    const last = tab(/^gold\.cursed_houses/);

    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(second).toHaveAttribute("tabindex", "-1");
    await expect(last).toHaveAccessibleName("gold.cursed_houses , has an error");

    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(live.getByRole("tabpanel")).toContainText("from bronze.porch_events");

    // The disabled gold.ledger tab sits between these two and is skipped.
    await page.keyboard.press("ArrowRight");
    await expect(last).toBeFocused();
    await expect(tab("gold.ledger")).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("ArrowRight");
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(last).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
    await page.keyboard.press("End");
    await expect(last).toBeFocused();

    await page.keyboard.press("Tab");
    const panel = live.getByRole("tabpanel");
    await expect(panel).toBeFocused();
    await expect(panel).toHaveAccessibleName(/^gold\.cursed_houses/);
  });

  test("a click selects a tab, but not a disabled one", async ({ page }) => {
    const live = specimen(page, /^Live: per-model/);
    await live.getByRole("tab", { name: "silver.light_events" }).click();
    await expect(live.getByRole("tab", { name: "silver.light_events" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // Forced: Playwright waits for aria-disabled elements to become enabled before clicking.
    await live.getByRole("tab", { name: "gold.ledger" }).click({ force: true });
    await expect(live.getByRole("tab", { name: "gold.ledger" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});

test.describe("panel", () => {
  test("is a named region that lights its title while it holds focus", async ({ page }) => {
    const results = page.getByRole("region", { name: "Results" });
    const title = results.getByRole("heading", { name: "Results" });
    const ash = "rgb(184, 174, 156)";
    const parchment = "rgb(237, 227, 207)";
    await expect(title).toHaveCSS("color", ash);

    await results.getByRole("button", { name: "Hide panel" }).focus();
    await expect(title).toHaveCSS("color", parchment);
  });

  test("an error offers a retry that loads and recovers", async ({ page }) => {
    const panel = specimen(page, "Error, with recovery");
    await expect(panel.getByRole("alert")).toHaveText(/The story didn't arrive\./);
    await panel.getByRole("button", { name: "Retry" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("status")).toHaveText("Loading the story");
    await expect(panel.getByText("The porch lights of Hollow Creek")).toBeVisible();
  });
});

test.describe("dialog", () => {
  test("traps focus, closes on Escape, and returns focus to its trigger", async ({ page }) => {
    const trigger = specimen(page, /^Destructive confirm/).getByRole("button", {
      name: "Abandon run",
    });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("alertdialog", { name: "Abandon this run?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription(/The night ends here\./);
    // The safe choice holds focus first.
    await expect(dialog.getByRole("button", { name: "Not yet" })).toBeFocused();

    // Tab wraps at both ends instead of escaping to the browser's toolbar.
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Abandon" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Not yet" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Abandon" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("a confirm shows its work, its failure, and then succeeds", async ({ page }) => {
    await specimen(page, /^Destructive confirm/)
      .getByRole("button", { name: "Abandon run" })
      .click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Abandon" }).click();
    await expect(dialog.getByRole("button", { name: /working/ })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(dialog.getByRole("alert")).toContainText("The Crypt didn’t answer.");
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: "Try again" }).click();
    await expect(dialog).toBeHidden();
    await expect(toasts(page).getByRole("status")).toContainText("Run abandoned");
  });

  test("Escape closes a tooltip inside the dialog before the dialog", async ({ page }) => {
    const trigger = specimen(page, /^Information/).getByRole("button", {
      name: "Keyboard shortcuts",
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    const close = dialog.getByRole("button", { name: "Close" });
    await expect(close).toBeFocused();
    await expect(dialog.getByRole("tooltip")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog.getByRole("tooltip")).toBeHidden();
    await expect(dialog).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("closes from its close button and from the backdrop", async ({ page }) => {
    const trigger = specimen(page, /^Information/).getByRole("button", {
      name: "Keyboard shortcuts",
    });
    const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });

    await trigger.click();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();

    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(dialog).toBeHidden();
  });
});

test.describe("toast", () => {
  test("announces through live regions and shows two at a time", async ({ page }) => {
    const live = specimen(page, "Live");
    const region = toasts(page);
    await live.getByRole("button", { name: "Show an error" }).click();
    await expect(region.getByRole("alert")).toContainText("The night couldn't run");

    await live.getByRole("button", { name: "Show a warning" }).click();
    await live.getByRole("button", { name: "Show a notice" }).click();
    const dismiss = region.getByRole("button", { name: "Dismiss" });
    await expect(dismiss).toHaveCount(2);
    await expect(region).not.toContainText("The engine is warm");

    // Dismissing from the keyboard promotes the waiting toast and keeps focus in the stack.
    await dismiss.first().focus();
    await page.keyboard.press("Enter");
    await expect(region).toContainText("The engine is warm");
    await expect(dismiss).toHaveCount(2);
    await expect(dismiss.first()).toBeFocused();

    // Escape inside a toast dismisses it.
    await page.keyboard.press("Escape");
    await expect(dismiss).toHaveCount(1);
  });

  test("stacks toasts oldest first, whatever their tone", async ({ page }) => {
    const live = specimen(page, "Live");
    const region = toasts(page);
    await live.getByRole("button", { name: "Show an error" }).click();
    await live.getByRole("button", { name: "Show a notice" }).click();

    const top = async (title: string) => {
      const box = await region.getByText(title, { exact: true }).boundingBox();
      if (!box) throw new Error(`"${title}" is not on screen.`);
      return box.y;
    };
    expect(await top("The night couldn't run")).toBeLessThan(await top("The engine is warm"));

    // Each toast is still spoken once, in its tone's live region.
    await expect(region.getByRole("alert")).toHaveText(/^Error: The night couldn't run\./);
    await expect(region.getByRole("status")).toHaveText(/^Notice: The engine is warm\./);
  });

  test("errors stay until dismissed; notices fade on their own", async ({ page }) => {
    await page.clock.install();
    await page.reload();
    const live = specimen(page, "Live");
    await live.getByRole("button", { name: "Show a notice" }).click();
    await live.getByRole("button", { name: "Show an error" }).click();
    const region = toasts(page);
    await expect(region).toContainText("The engine is warm");

    await page.clock.runFor(6000);
    await expect(region).not.toContainText("The engine is warm");
    await expect(region).toContainText("The night couldn't run");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a busy button's spinner holds still", async ({ page }) => {
    const preview = specimen(page, /^Live: the disabled one/).getByRole("button", {
      name: /^Preview/,
    });
    await preview.click();
    await expect(preview.locator("svg")).toHaveCSS("animation-name", "none");
  });
});

test("a busy button's spinner turns at full motion", async ({ page }) => {
  const preview = specimen(page, /^Live: the disabled one/).getByRole("button", {
    name: /^Preview/,
  });
  await preview.click();
  await expect(preview.locator("svg")).toHaveCSS("animation-name", "spin");
});
