import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

// The fixture night loads into the real DuckDB-WASM engine, which downloads on first use.
const ENGINE_TIMEOUT = 60_000;
test.describe.configure({ timeout: 2 * ENGINE_TIMEOUT });

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/tables");
  await expect(page.getByRole("heading", { level: 1, name: "Table browser" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "bronze.porch_events" })).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
});

test("the table browser gallery renders the fixture night without console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  const porch = page.getByRole("treeitem", { name: "bronze.porch_events" });
  await expect(porch).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(porch).toContainText("18 rows");
  await expect(porch).toHaveAccessibleDescription(/batches 3–5 · 3 retired · 5 columns/);
  await expect(page.getByText("Keeps the last 3 batches")).toBeVisible();
  const bowls = page.getByRole("tree", { name: "Bronze feeds" });
  await expect(bowls.getByRole("treeitem", { name: /^grams DOUBLE$/ })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: "silver.latest_porch" })).toContainText("view");
  await expect(page.getByRole("treeitem", { name: "gold.welcoming_houses" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the keyboard walks, collapses, and expands the tree", async ({ page }) => {
  const bronze = page.getByRole("tree", { name: "Bronze feeds" });
  const bowls = bronze.getByRole("treeitem", { name: "bronze.bowl_weights" });
  const porch = bronze.getByRole("treeitem", { name: "bronze.porch_events" });

  await bowls.focus();
  await expect(bowls).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(bowls).toHaveAttribute("aria-expanded", "false");
  await expect(bronze.getByRole("treeitem", { name: /^grams / })).toHaveCount(0);

  await page.keyboard.press("ArrowDown");
  await expect(porch).toBeFocused();
  await page.keyboard.press("Home");
  await expect(bowls).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(bowls).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(bronze.getByRole("treeitem", { name: /^grams / })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(bowls).toBeFocused();

  const gold = page.getByRole("treeitem", { name: "gold.welcoming_houses" });
  await expect(gold).toHaveAttribute("aria-expanded", "false");
  await gold.focus();
  await page.keyboard.press("Enter");
  await expect(gold).toHaveAttribute("aria-expanded", "true");
});

test("picking a column by click or keyboard calls onPick", async ({ page }) => {
  const log = page.getByRole("region", { name: "Picked columns" }).getByRole("list").first();
  const bronze = page.getByRole("tree", { name: "Bronze feeds" });

  await bronze
    .getByRole("treeitem", { name: /^house VARCHAR$/ })
    .first()
    .click();
  await expect(log.getByText("bronze.bowl_weights.house", { exact: true })).toBeVisible();

  const state = bronze.getByRole("treeitem", { name: /^state VARCHAR$/ });
  await state.focus();
  await page.keyboard.press("Enter");
  await expect(log.getByText("bronze.porch_events.state", { exact: true })).toBeVisible();
});

test("loading, empty, and error states", async ({ page }) => {
  await page.getByRole("button", { name: "Loading" }).click();
  await expect(page.getByRole("status").getByText("Reading the tables")).toBeAttached();
  await page.getByRole("button", { name: "Nothing landed" }).click();
  await expect(page.getByText("Nothing has landed yet.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Engine error" }).click();
  await expect(page.getByRole("region", { name: "Tables" }).getByRole("alert")).toContainText(
    "The engine failed to load.",
  );
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("treeitem", { name: "bronze.porch_events" })).toBeVisible();
});
