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

test("a splitter is a calm night gutter that shows the control line, never amber", async ({
  page,
}) => {
  await open(page);
  const column = splitter(page, /story and tables column/);
  const results = splitter(page, /Resize the results/);
  const look = (separator: Locator) =>
    separator.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return { background: style.backgroundColor, width: box.width, height: box.height };
    });
  const night = "rgb(10, 14, 24)";
  const control = "rgb(94, 110, 148)";

  expect(await look(column)).toMatchObject({ background: night, width: 4 });
  expect(await look(results)).toMatchObject({ background: night, height: 4 });

  // The hit area reaches past the gutter into the pane after it.
  const box = await column.boundingBox();
  if (box === null) throw new Error("splitter has no box");
  await page.mouse.move(box.x + box.width + 3, box.y + box.height / 2);
  await expect.poll(async () => (await look(column)).background).toBe(control);

  await page.mouse.move(box.x + 300, box.y + box.height / 2);
  await results.focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await look(results)).background).toBe(control);
  await expect.poll(async () => (await look(column)).background).toBe(night);
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

/**
 * Dispatches pointer events on a splitter in one task, the way Chrome delivers a drag's last
 * move and its release: nothing renders between them.
 */
async function pointerBurst(
  separator: Locator,
  events: readonly { readonly type: string; readonly x: number; readonly y: number }[],
) {
  await separator.evaluate((element, burst) => {
    for (const { type, x, y } of burst) {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
          clientX: x,
          clientY: y,
        }),
      );
    }
  }, events);
}

test("a drag commits where the pointer lets go, before any move renders", async ({ page }) => {
  await open(page);
  const column = splitter(page, /story and tables column/);
  const box = await column.boundingBox();
  if (box === null) throw new Error("splitter has no box");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const stored = () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);

  // A flick: press, one move, and release, all before React renders the press.
  await pointerBurst(column, [
    { type: "pointerdown", x, y },
    { type: "pointermove", x: 1440 * 0.45, y },
    { type: "pointerup", x: 1440 * 0.45, y },
  ]);
  await expect(column).toHaveAttribute("aria-valuenow", "45");
  expect(await stored()).toContain('"left":45');

  // A drag whose last move and release arrive together: the release wins over the stale move.
  const moved = await column.boundingBox();
  if (moved === null) throw new Error("splitter has no box");
  await pointerBurst(column, [
    { type: "pointerdown", x: moved.x + moved.width / 2, y },
    { type: "pointermove", x: 1440 * 0.3, y },
  ]);
  await expect(column).toHaveAttribute("aria-valuenow", "30");
  await pointerBurst(column, [
    { type: "pointermove", x: 1440 * 0.4, y },
    { type: "pointerup", x: 1440 * 0.4, y },
  ]);
  await expect(column).toHaveAttribute("aria-valuenow", "40");
  expect(await stored()).toContain('"left":40');
  await expect(column).not.toHaveAttribute("data-dragging");
});

test("on a short window each separator reports the share its pane really gets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await open(page);

  /** The controlled pane's share of its region, less the region's gutters, as the grid lays it out. */
  const rendered = (separator: Locator) =>
    separator.evaluate((element) => {
      const pane = document.getElementById(element.getAttribute("aria-controls") ?? "");
      const region = element.parentElement;
      if (pane === null || region === null) return Number.NaN;
      const vertical = element.getAttribute("aria-orientation") === "vertical";
      const length = (box: DOMRect) => (vertical ? box.width : box.height);
      const gutters = region.querySelectorAll(":scope > [role=separator]").length;
      const space =
        length(region.getBoundingClientRect()) - gutters * length(element.getBoundingClientRect());
      return (length(pane.getBoundingClientRect()) / space) * 100;
    });

  for (const name of [/Resize the story$/, /story and tables column/, /pipeline/, /results/]) {
    const separator = splitter(page, name);
    await separator.focus();
    for (const key of ["End", "Home"]) {
      await page.keyboard.press(key);
      await expect
        .poll(async () => Math.abs((await rendered(separator)) - (await valueOf(separator))))
        .toBeLessThanOrEqual(1);
      // The key reached the real limit: the separator offers nothing past it.
      const limit = await separator.getAttribute(key === "End" ? "aria-valuemax" : "aria-valuemin");
      await expect(separator).toHaveAttribute("aria-valuenow", String(limit));
    }
  }

  // The story's ceiling is the tables' floor, not the 80% a taller window allows.
  const story = splitter(page, /Resize the story$/);
  await story.focus();
  await page.keyboard.press("End");
  expect(await valueOf(story)).toBeLessThan(80);
  const tables = await page.getByTestId("run-layout").evaluate((layout) => {
    const separator = layout.querySelector('[role=separator][aria-label="Resize the story"]');
    return separator?.nextElementSibling?.getBoundingClientRect().height ?? 0;
  });
  expect(tables).toBeGreaterThanOrEqual(127);
  expect(tables).toBeLessThanOrEqual(130);
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
