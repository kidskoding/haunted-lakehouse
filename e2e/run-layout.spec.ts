import { expect, test, type Locator, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

const STORAGE_KEY = "haunted-lakehouse:run-layout:v1";

test.use({ viewport: { width: 1440, height: 900 } });

async function open(page: Page) {
  await page.goto("/dev/run");
  await expect(page.getByTestId("run-layout")).toBeVisible();
}

function splitter(page: Page, name: RegExp): Locator {
  return page.getByRole("separator", { name });
}

async function valueOf(separator: Locator): Promise<number> {
  return Number(await separator.getAttribute("aria-valuenow"));
}

test("renders every pane with real separators and no console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await open(page);
  await expect(
    page.getByRole("heading", { level: 1, name: "Porch Lights, 6:00pm" }),
  ).toBeAttached();
  await expect(page.getByRole("separator")).toHaveCount(4);
  const column = splitter(page, /story and tables column/);
  await expect(column).toHaveAttribute("aria-orientation", "vertical");
  await expect(column).toHaveAttribute("aria-valuenow", "32");
  await expect(column).toHaveAttribute("aria-valuemin", "22");
  await expect(column).toHaveAttribute("aria-valuemax", "50");
  await expect(splitter(page, /Resize the story$/)).toHaveAttribute(
    "aria-orientation",
    "horizontal",
  );
  await expect(page.getByTestId("pipeline-dag")).toBeVisible();
  await expect(page.getByRole("textbox", { name: /SQL for/ })).toBeVisible({ timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("arrow keys, Home, End, and Enter resize from the keyboard", async ({ page }) => {
  await open(page);
  const column = splitter(page, /story and tables column/);
  await column.focus();
  await expect(column).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(column).toHaveAttribute("aria-valuenow", "34");
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(column).toHaveAttribute("aria-valuenow", "24");
  await page.keyboard.press("End");
  await expect(column).toHaveAttribute("aria-valuenow", "50");
  await page.keyboard.press("Home");
  await expect(column).toHaveAttribute("aria-valuenow", "22");
  await page.keyboard.press("Enter");
  await expect(column).toHaveAttribute("aria-valuenow", "32");

  // The results sit below their splitter, so moving the line up grows them.
  const results = splitter(page, /Resize the results/);
  await results.focus();
  await page.keyboard.press("ArrowUp");
  await expect(results).toHaveAttribute("aria-valuenow", "32");
});

test("the editor keeps its floor when the dag and results grow", async ({ page }) => {
  await open(page);
  const results = splitter(page, /Resize the results/);
  await results.focus();
  await page.keyboard.press("End");
  const dag = splitter(page, /Resize the pipeline/);
  await dag.focus();
  await page.keyboard.press("End");
  expect((await valueOf(dag)) + (await valueOf(results))).toBeLessThanOrEqual(66);
});

test("dragging a splitter resizes its pane, and a double-click resets it", async ({ page }) => {
  await open(page);
  const column = splitter(page, /story and tables column/);
  const box = await column.boundingBox();
  if (box === null) throw new Error("splitter has no box");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(1440 * 0.45, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => valueOf(column)).toBeGreaterThanOrEqual(44);
  expect(await valueOf(column)).toBeLessThanOrEqual(46);
  const story = page.locator(`[id="${String(await column.getAttribute("aria-controls"))}"]`);
  const width = (await story.boundingBox())?.width ?? 0;
  expect(width).toBeGreaterThan(1440 * 0.42);

  await column.dblclick();
  await expect(column).toHaveAttribute("aria-valuenow", "32");
});

test("the layout survives a reload, and bad stored values fall back", async ({ page }) => {
  await open(page);
  const story = splitter(page, /Resize the story$/);
  await story.focus();
  await page.keyboard.press("End");
  await expect(story).toHaveAttribute("aria-valuenow", "80");
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain(
    '"story":80',
  );

  await page.reload();
  await expect(splitter(page, /Resize the story$/)).toHaveAttribute("aria-valuenow", "80");

  await page.evaluate((key) => {
    localStorage.setItem(key, '{"left":"wide","story":9000,"dag":null}');
  }, STORAGE_KEY);
  const errors = collectConsoleErrors(page);
  await page.reload();
  await expect(splitter(page, /story and tables column/)).toHaveAttribute("aria-valuenow", "32");
  await expect(splitter(page, /Resize the story$/)).toHaveAttribute("aria-valuenow", "80");
  await expect(splitter(page, /Resize the pipeline/)).toHaveAttribute("aria-valuenow", "24");
  expect(errors).toEqual([]);
});

test("a narrow window shows the laptop message instead of the panels", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  const errors = collectConsoleErrors(page);
  await page.goto("/dev/run");
  await expect(
    page.getByRole("heading", { level: 1, name: "Hollow Creek needs a wider window" }),
  ).toBeVisible();
  await expect(page.getByTestId("run-layout")).toBeHidden();
  await expect(page.getByRole("separator")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("screenshots the run screen at the three review widths", async ({ page }, testInfo) => {
  await open(page);
  await expect(page.getByRole("textbox", { name: /SQL for/ })).toBeVisible({ timeout: 15_000 });
  for (const width of [1280, 1440, 1920] as const) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 800 });
    await page.screenshot({ path: testInfo.outputPath(`run-layout-${String(width)}.png`) });
  }

  // The tightest editor the layout allows, with a seam focused from the keyboard.
  await page.setViewportSize({ width: 1280, height: 800 });
  await splitter(page, /Resize the pipeline/).focus();
  await page.keyboard.press("End");
  const results = splitter(page, /Resize the results/);
  await results.focus();
  await page.keyboard.press("End");
  await expect(results).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("run-layout-1280-editor-floor.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("run-layout-390.png") });
});
