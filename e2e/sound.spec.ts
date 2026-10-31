import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const SETTINGS_KEY = "haunted-lakehouse:sound";

test("sound starts muted, unlocks on one click, and persists volume", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/sound");

  await expect(page.getByRole("heading", { level: 1, name: "Sound" })).toBeVisible();
  const control = page.getByRole("group", { name: "Sound" });
  await expect(control).toHaveAttribute("data-sound-status", "off");

  const toggle = control.getByRole("button", { name: "Sound" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Candle out" })).toBeDisabled();

  const volume = control.getByRole("slider", { name: "Volume" });
  await volume.fill("40");
  await expect(volume).toHaveValue("40");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(control).toHaveAttribute("data-sound-status", "on");
  await expect(page.getByRole("button", { name: "Candle out" })).toBeEnabled();

  const stored = await page.evaluate((key) => localStorage.getItem(key), SETTINGS_KEY);
  expect(JSON.parse(stored ?? "")).toEqual({ muted: false, volume: 0.4 });

  await page.getByRole("button", { name: "Hour cleared" }).click();
  await expect(control).toHaveAttribute("data-sound-status", "on");

  expect(errors).toEqual([]);
});

test("a saved unmuted preference stays locked until the first gesture", async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ muted: false, volume: 0.7 }));
  }, SETTINGS_KEY);

  await page.goto("/dev/sound");
  const control = page.getByRole("group", { name: "Sound" });
  await expect(control).toHaveAttribute("data-sound-status", "locked");
  await expect(control.getByRole("button", { name: "Sound" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "Death" })).toBeDisabled();

  await page.mouse.click(8, 8);
  await expect(control).toHaveAttribute("data-sound-status", "on");
  await expect(page.getByRole("button", { name: "Death" })).toBeEnabled();
});
