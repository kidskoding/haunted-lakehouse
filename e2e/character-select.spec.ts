import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const TITLE = "Who takes the night?";

test("a new player sees only the Intern open, and no console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/run/new");
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();

  const group = page.getByRole("radiogroup", { name: TITLE });
  await expect(group.getByRole("radio")).toHaveCount(4);
  await expect(group.getByRole("radio", { name: /The Intern/ })).toBeChecked();
  await expect(group.getByRole("radio", { disabled: true })).toHaveCount(3);

  await expect(page.getByText("4 candles")).toBeVisible();
  await expect(page.getByText("Wren's Lantern")).toBeVisible();
  await expect(page.getByText("Clear the Act I boss to unlock.")).toBeVisible();
  await expect(page.getByText("Clear the Act II boss to unlock.")).toBeVisible();
  await expect(page.getByText("Reach the true ending to unlock.")).toBeVisible();
  await expect(page.getByText("Old Wren")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("locked radios describe how to unlock them", async ({ page }) => {
  await page.goto("/run/new");
  await expect(page.getByRole("radio", { name: /The Night Clerk/ })).toHaveAccessibleDescription(
    /Clear the Act I boss to unlock\./,
  );
});

test("arrow keys move through open characters and skip locked ones", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/characters");
  const intern = page.getByRole("radio", { name: /The Intern/ });
  const clerk = page.getByRole("radio", { name: /The Night Clerk/ });
  const purist = page.getByRole("radio", { name: /The Purist/ });

  await page.keyboard.press("Tab");
  await expect(intern).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(clerk).toBeFocused();
  await expect(clerk).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(purist).toBeChecked();
  // Old Wren is locked, so the group wraps back to the Intern.
  await page.keyboard.press("ArrowRight");
  await expect(intern).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(purist).toBeChecked();
  await expect(page.getByText("No table models. Incremental or nothing.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the whole cast opens once the true ending is seen", async ({ page }) => {
  await page.goto("/dev/characters?progress=complete");
  await expect(page.getByRole("radio", { disabled: true })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Old Wren/ })).toBeEnabled();
  await expect(page.getByText("No relics, ever.")).toBeVisible();
});

test("Enter confirms the checked character and moves on to the run", async ({ page }) => {
  await page.goto("/dev/characters");
  // Clicking the card checks its radio and focuses it, as a native label does.
  await page.getByText("The Night Clerk", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /The Night Clerk/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/run\?character=night_clerk$/);
});

test("the start button confirms the default character", async ({ page }) => {
  await page.goto("/run/new");
  await page.getByRole("button", { name: "Start the night" }).click();
  await page.waitForURL(/\/run\?character=intern$/);
});
