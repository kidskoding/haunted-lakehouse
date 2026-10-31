import { expect, test, type Page } from "@playwright/test";
import { collectConsoleErrors } from "./console-errors";

// The engine downloads and the night replays every batch in the browser.
test.describe.configure({ timeout: 180_000 });

const SEED = "raven-pumpkin-13";

// Porch Lights' incremental REFERENCE from src/server/engine/puzzles/porch-lights/pipelines.ts,
// which its tests show survives every night. Server-only modules can't be imported here.
const REFERENCE = {
  "silver/porch_state": `{{ config(materialized='incremental', unique_key='house_id') }}
with latest as (
  select house_id, arg_max(state, seq) as state, max(seq) as seq
  from {{ new_batch('porch_lights') }}
  group by house_id
)
{% if is_incremental() %}
select l.* from latest l
left join {{ this }} t using (house_id)
where t.seq is null or l.seq > t.seq
{% else %}
select * from latest
{% endif %}
`,
  "gold/welcoming_houses": `{{ config(materialized='view') }}
select count(*) filter (where state = 'on') as houses
from silver.porch_state
`,
};

// EVER_ON_TRAP from the same file: every house that ever reported `on`. On this seed it
// breaks at the first checkpoint, on a batch the player could already see.
const TRAP = `{{ config(materialized='view') }}
select count(distinct house_id) as houses
from bronze.porch_lights
where state = 'on'
`;

/** Starts a run on the seed from the character select, as Replay seed does. */
async function startRun(page: Page) {
  await page.goto(`/run/new?seed=${SEED}`);
  await page.getByRole("button", { name: "Start the night" }).click();
  await page.waitForURL(/\/run\?run=[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 2, name: "Porch Lights" })).toBeVisible();
  // Bronze is in once the table browser lists the feed.
  await expect(page.getByText("porch_lights", { exact: true }).first()).toBeVisible({
    timeout: 90_000,
  });
}

/** Waits out entrance animations, so a screenshot is at rest. */
async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
}

/** Replaces the open model's source, the way a paste would. */
async function writeModel(page: Page, tab: string, source: string) {
  await page.getByRole("tab", { name: tab }).click();
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(source);
  await page.keyboard.press("Escape");
}

async function runTheNight(page: Page) {
  await page.getByRole("button", { name: "Run the night" }).last().click();
  // The confirm turns into an alert dialog when the last candle is at stake.
  const confirm = page.locator("dialog[open]", {
    has: page.getByRole("heading", { name: "Run the night?" }),
  });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Run the night" }).click();
  await expect(page.getByRole("button", { name: /Skip/ })).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue" }).click();
}

test("the reference pipeline survives Porch Lights and the hour clears", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startRun(page);

  await page.getByLabel("New model").fill("silver/porch_state");
  await page.getByRole("button", { name: "Add" }).click();
  await writeModel(page, "silver/porch_state", REFERENCE["silver/porch_state"]);
  await writeModel(page, "gold/welcoming_houses", REFERENCE["gold/welcoming_houses"]);

  await page.getByRole("button", { name: "Preview" }).last().click();
  await expect(page.getByText("gold.welcoming_houses").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: /houses/ })).toBeVisible();
  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `test-results/run-hour-${String(width)}.png` });
  }

  await runTheNight(page);
  await expect(page.getByRole("heading", { name: "Porch Lights, cleared" })).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
  await page.screenshot({ path: "test-results/run-cleared.png", fullPage: true });

  // Through the autopsy to the relic offer, then on into the next hour.
  await page.getByRole("button", { name: "What really happened" }).click();
  await page.getByRole("button", { name: "Choose a relic" }).click();
  await page.getByRole("button", { name: /Take/ }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "The Thirteenth Door" })).toBeVisible({
    timeout: 30_000,
  });
  // The pipeline built in the first hour is still there.
  await expect(page.getByRole("tab", { name: /silver\/porch_state/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a trap pipeline breaks the night and costs a candle", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startRun(page);
  await writeModel(page, "gold/welcoming_houses", TRAP);
  await runTheNight(page);

  const lost = page.getByRole("alertdialog", { name: "A candle goes out" });
  await expect(lost).toBeVisible({ timeout: 30_000 });
  await expect(lost.getByText("3 of 4 candles still lit.")).toBeVisible();
  await expect(lost.getByText(/6:15pm checkpoint/)).toBeVisible();
  await page.screenshot({ path: "test-results/run-candle-lost.png" });
  await lost.getByRole("button", { name: "Back to the pipeline" }).click();
  await expect(lost).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: "Porch Lights" })).toBeVisible();
  // Bronze reloads for the visible batches, and the pipeline can be previewed again.
  await expect(page.getByRole("button", { name: "Preview" }).last()).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByText("Bronze didn't load.")).toHaveCount(0);
  await page.getByRole("button", { name: "Preview" }).last().click();
  await expect(page.getByRole("columnheader", { name: /houses/ })).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("the last candle going out ends the run at its stone", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await startRun(page);
  await writeModel(page, "gold/welcoming_houses", TRAP);
  for (let candle = 0; candle < 3; candle++) {
    await runTheNight(page);
    await page.getByRole("button", { name: "Back to the pipeline" }).click();
  }
  await runTheNight(page);

  await expect(page.getByRole("heading", { name: "The last candle is out." })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("group", { name: "Tombstone of A New Hire" })).toContainText(SEED);
  await expect(page.getByRole("link", { name: "Replay seed" })).toHaveAttribute(
    "href",
    `/run/new?seed=${SEED}`,
  );
  // A reload resumes the run where it ended.
  await page.reload();
  await expect(page.getByRole("heading", { name: "The last candle is out." })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: "test-results/run-death.png" });
  expect(errors).toEqual([]);
});
