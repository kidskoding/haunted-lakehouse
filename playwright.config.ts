import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = `http://localhost:${String(port)}`;

// Playwright's downloaded browsers cannot run on NixOS, so local runs point this at a
// Nix-provided chromium. CI leaves it unset and uses Playwright's own browser.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // CI also writes the HTML report so a failed run can upload it as an artifact.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  webServer: {
    command: `bun run dev --port ${String(port)}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
