import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/dag");
  await expect(page.getByRole("heading", { level: 1, name: "Pipeline DAG" })).toBeVisible();
});

test("renders a layered graph from compile-shaped fixtures without console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  const dag = page.getByTestId("pipeline-dag");
  await expect(dag).toBeVisible();
  await expect(dag.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(dag.locator('[data-node="gold.lit_at_checkpoint"]')).toBeVisible();
  await expect(dag.locator('[data-node="bronze.porch_events"]')).toBeVisible();
  // Edges live in an aria-hidden SVG (nodes carry the accessible names), so check attachment.
  await expect(dag.locator("svg path[data-edge]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("clicking a model records the editor-tab stub", async ({ page }) => {
  const model = page.locator('[data-node="silver.latest"]');
  await model.click();
  await expect(page.getByRole("complementary", { name: "Editor stub" })).toContainText(
    "Would open silver.latest",
  );
  await expect(model).toHaveAttribute("aria-current", "page");
});

test("arrow keys walk models in DAG order and Enter opens the focused one", async ({ page }) => {
  const first = page.locator('[data-node="silver.latest"]');
  await first.focus();
  await expect(first).toBeFocused();

  await page.keyboard.press("ArrowRight");
  const gold = page.locator('[data-node="gold.lit_at_checkpoint"]');
  await expect(gold).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary", { name: "Editor stub" })).toContainText(
    "Would open gold.lit_at_checkpoint",
  );
});

test("the cycle scenario surfaces the loop and keeps nodes openable", async ({ page }) => {
  await page.getByRole("tab", { name: "Cycle" }).click();
  const dag = page.getByTestId("pipeline-dag");
  await expect(dag.getByText("The pipeline reads itself in a loop")).toBeVisible();
  await expect(dag.locator("svg path[data-edge]")).toHaveCount(3);
  await dag.locator('[data-node="silver.a"]').click();
  await expect(page.getByRole("complementary", { name: "Editor stub" })).toContainText(
    "Would open silver.a",
  );
});

test("screenshots the porch-lights graph at the three review widths", async ({
  page,
}, testInfo) => {
  const dag = page.getByTestId("pipeline-dag");
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(dag).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`dag-porch-${String(width)}.png`),
      fullPage: true,
    });
  }
});
