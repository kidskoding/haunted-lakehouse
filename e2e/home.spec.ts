import { expect, test } from "@playwright/test";

test("home page shows the title and tagline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Haunted Lakehouse" })).toBeVisible();
  await expect(
    page.getByText("A roguelike where your data pipeline has to survive Halloween night."),
  ).toBeVisible();
});
