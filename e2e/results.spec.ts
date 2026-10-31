import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/results");
  await expect(page.getByRole("heading", { level: 1, name: "Results grid" })).toBeVisible();
});

test("the gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(page.getByRole("grid", { name: "gold.porch_lights" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("virtualized grid exposes rows, selection, and copy controls", async ({ page }) => {
  const grid = page.getByRole("grid", { name: "gold.porch_lights" });
  await expect(grid).toBeVisible();
  await expect(page.getByText("8 rows · 5 columns")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy all rows" })).toBeVisible();

  await grid.focus();
  await expect(grid).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText(/Row 2 · house_id/)).toBeVisible();
});

test("the SQL error state is an alert with copyable details", async ({ page }) => {
  await page.getByRole("button", { name: "SQL error" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "DuckDB rejected the SQL." });
  await expect(alert).toBeVisible();
  await expect(page.getByLabel("Engine error details")).toContainText("Binder Error");
  await expect(page.getByRole("button", { name: "Copy details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("idle and loading keep the results chrome", async ({ page }) => {
  await page.getByRole("button", { name: "Idle" }).click();
  await expect(page.getByText("No result yet")).toBeVisible();
  await expect(page.getByText("Preview a model or run a query; the rows land here.")).toBeVisible();

  await page.getByRole("button", { name: "Loading" }).click();
  await expect(page.getByText("Running…")).toBeVisible();
  await expect(page.getByText("Running the preview")).toBeVisible();
});

test("a tall result still exposes the last row after scrolling", async ({ page }) => {
  await page.getByRole("button", { name: "2,000 rows" }).click();
  const grid = page.getByRole("grid", { name: "silver.bowl_takings" });
  await expect(grid).toBeVisible();
  await expect(page.getByText("2,000 rows · 4 columns")).toBeVisible();

  await grid.focus();
  await page.keyboard.press("Control+End");
  await expect(page.getByText(/Row 2,000 ·/)).toBeVisible();
});

test.describe("art-direction widths", () => {
  for (const width of [1280, 1440, 1920] as const) {
    test(`renders the grid at ${String(width)}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole("grid", { name: "gold.porch_lights" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Copy all rows" })).toBeVisible();
    });
  }
});
