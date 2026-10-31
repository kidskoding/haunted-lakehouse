import { expect, test } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/editor");
  await expect(page.getByRole("heading", { level: 1, name: "SQL editor" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: /SQL for/ })).toBeVisible({ timeout: 15_000 });
});

test("the editor gallery renders without console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(page.getByRole("textbox", { name: /SQL for/ })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("tabs switch by keyboard and show the error marker", async ({ page }) => {
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  await tabs.first().focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { selected: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { selected: true })).toContainText("gold/broken_count");
  await expect(page.getByRole("tab", { selected: true })).toContainText("has an error");
});

test("typing and completing a column from the schema", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: /SQL for/ });
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("select * from bronze.porch_events where bronze.porch_events.");
  await page.keyboard.press("Control+Space");
  const option = page.getByRole("option", { name: /^house_id/ }).first();
  await expect(option).toBeVisible({ timeout: 8_000 });
  await option.click();
  await expect(editor).toContainText("bronze.porch_events.house_id");
});

test("materialization picker rewrites the config call", async ({ page }) => {
  const select = page.getByLabel("Materialized");
  await select.selectOption("table");
  const editor = page.getByRole("textbox", { name: /SQL for/ });
  await expect(editor).toContainText("materialized='table'");
});

test("format and preview shortcuts fire", async ({ page }) => {
  const log = page.getByRole("region", { name: "Shortcut log" }).getByRole("list");
  await page.getByRole("button", { name: /Format/ }).click();
  await page.getByRole("button", { name: /^Preview/ }).click();
  await expect(log.getByText("Preview", { exact: true })).toHaveCount(1);

  const editor = page.getByRole("textbox", { name: /SQL for/ });
  await editor.click();
  await page.keyboard.press("Control+Shift+Enter");
  await expect(log.getByText("Run the night", { exact: true })).toHaveCount(1);
});
